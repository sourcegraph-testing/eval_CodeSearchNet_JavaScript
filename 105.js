'use strict';

var kevoree = require('kevoree-library'),
	ModelObjectMapper = require('./ModelObjectMapper');

// Adaptation Primitives
var AddInstance = require('./adaptations/AddInstance'),
	AddBinding = require('./adaptations/AddBinding'),
	AddDeployUnit = require('./adaptations/AddDeployUnit'),
	RemoveBinding = require('./adaptations/RemoveBinding'),
	RemoveInstance = require('./adaptations/RemoveInstance'),
	StartInstance = require('./adaptations/StartInstance'),
	StopInstance = require('./adaptations/StopInstance'),
	UpdateInstance = require('./adaptations/UpdateInstance'),
	UpdateDictionary = require('./adaptations/UpdateDictionary'),
	HaraKiri = require('./adaptations/HaraKiri');


// CONSTANTS
var COMMAND_RANK = {
	// highest priority
	StopInstance: 0,
	RemoveBinding: 1,
	RemoveInstance: 2,
	RemoveTypeDef: 3,
	RemoveDeployUnit: 4,
	AddDeployUnit: 5,
	AddTypeDef: 6,
	AddInstance: 7,
	AddBinding: 8,
	UpdateDictionary: 9,
	UpdateInstance: 10,
	StartInstance: 11,
	HaraKiri: 12
	// lowest priority
};

function isInstance(c) {
	return c.metaClassName() === 'org.kevoree.ContainerNode' ||
		c.metaClassName() === 'org.kevoree.Group' ||
		c.metaClassName() === 'org.kevoree.Channel' ||
		c.metaClassName() === 'org.kevoree.ComponentInstance';
}

function isTypeDefinition(c) {
	return c.metaClassName() === 'org.kevoree.PortType' ||
		c.metaClassName() === 'org.kevoree.GroupType' ||
		c.metaClassName() === 'org.kevoree.ChannelType' ||
		c.metaClassName() === 'org.kevoree.NodeType' ||
		c.metaClassName() === 'org.kevoree.ComponentType';
}

/**
 * AdaptationEngine knows each AdaptationPrimitive command available
 * for JavascriptNode.
 * Plus, it handles model - object mapping
 *
 * @type {AdaptationEngine}
 */
function AdaptationEngine(node) {
	this.node = node;
	this.modelObjMapper = new ModelObjectMapper();
	var factory = new kevoree.factory.DefaultKevoreeFactory();
	this.compare = factory.createModelCompare();
	this.alreadyProcessedTraces = {};
	this.targetModel = null;
}

AdaptationEngine.prototype = {

	/**
	 * Process traces to find the right adaptation primitive command
	 * Returns a command to execute in order to do the adaptation logic
	 * @param diffSeq
	 * @param targetModel
	 * @returns {Array}
	 */
	processTraces: function (diffSeq, targetModel) {
		var self = this;
		this.targetModel = targetModel;

		// know if a trace has already been added to cmdList for {path <-> AdaptationPrimitive}
		var traceAlreadyProcessed = function (cmd) {
			return self.alreadyProcessedTraces[cmd.modelElement.path()] && self.alreadyProcessedTraces[cmd.modelElement.path()][cmd.toString()];
		};

		// add a trace to the processed trace map
		var addProcessedTrace = function (cmd) {
			self.alreadyProcessedTraces[cmd.modelElement.path()] = self.alreadyProcessedTraces[cmd.modelElement.path()] || {};
			self.alreadyProcessedTraces[cmd.modelElement.path()][cmd.toString()] = cmd;
		};

		// fill adaptation primitives list
		var cmdList = [];
		diffSeq.traces.array.forEach(function (trace) {
			self.processTrace(trace).forEach(function (cmd) {
				if (!traceAlreadyProcessed(cmd)) {
					cmdList.push(cmd);
					addProcessedTrace(cmd);
				}
			});
		});

		// clean primitives:
		//  - don't call UpdateInstance when (Start|Stop)Instance will be executed
		for (var path in this.alreadyProcessedTraces) {
			if (this.alreadyProcessedTraces[path][UpdateInstance.prototype.toString()]) {
				for (var type in this.alreadyProcessedTraces[path]) {
					if (type === StopInstance.prototype.toString() || type === StartInstance.prototype.toString()) {
						var index = cmdList.indexOf(this.alreadyProcessedTraces[path][UpdateInstance.prototype.toString()]);
						if (index > -1) {
							cmdList.splice(index, 1);
						}
					}
				}
			}
		}

		// free-up some mem
		this.targetModel = null;
		this.alreadyProcessedTraces = {};

		//return sorted command list (sort by COMMAND_RANK in order to process adaptations properly)
		// this.sortCommands(cmdList).forEach(function (cmd) {
		//   var tag = cmd.toString();
		//   while (tag.length < 20) {
		//     tag += ' ';
		//   }
		//   console.log(tag, cmd.modelElement.path());
		// });
		return this.sortCommands(cmdList);
	},

	/**
	 * Creates an array of AdaptationPrimitive according to the trace
	 * @param trace
	 */
	processTrace: function (trace) {
		var cmds = [],
			modelElement = this.targetModel.findByPath(trace.previousPath || trace.srcPath),
			currentModel,
			instance,
			du,
			meta,
			currentModelElement,
			targetModelElement;

		if (modelElement) {
			if (!this.isVirtual(modelElement)) {
				switch (trace.refName) {
					case 'groups':
					case 'hosts':
					case 'components':
						switch (trace.traceType.name()) {
							case 'ADD':
								if (this.isRelatedToPlatform(modelElement)) {
									meta = modelElement.typeDefinition.select('deployUnits[]/filters[name=platform,value=js]');
									if (meta.size() > 0) {
										du = meta.get(0).eContainer();
										if (!this.modelObjMapper.getObject(du.path())) {
											cmds.push(this.createCommand(AddDeployUnit, du));
										}
									} else {
										var err = new Error('no DeployUnit found for \'' + modelElement.name + ': ' + modelElement.typeDefinition.name + '/' + modelElement.typeDefinition.version + '\' that matches the \'js\' platform');
										err.className = this.toString();
										throw err;
									}

									if (!this.modelObjMapper.getObject(modelElement.path())) {
										cmds.push(this.createCommand(AddInstance, modelElement));
									}
								}
								break;

							case 'REMOVE':
								currentModel = this.node.getKevoreeCore().getCurrentModel(); // old model
								var instFromCurrModel = currentModel.findByPath(trace.objPath); // instance from current model
								var instFromTargModel = this.targetModel.findByPath(trace.objPath); // instance in target model
								if ((instFromTargModel && !this.isRelatedToPlatform(instFromTargModel)) || !instFromTargModel) {
									// instance is no longer related to platform or present in new model: stop & remove
									if (this.modelObjMapper.getObject(instFromCurrModel.path())) {
										if (instFromCurrModel.started) {
											cmds.push(this.createCommand(StopInstance, instFromCurrModel));
										}
										if (this.modelObjMapper.getObject(trace.objPath)) {
											cmds.push(this.createCommand(RemoveInstance, instFromCurrModel));
										}
									}
								}

								break;
						}
						break;

					case 'deployUnits':
						// switch (trace.traceType.name()) {
						//   case 'ADD':
						//     if (this.targetModel.findByPath(trace.srcPath).eContainer().metaClassName() === 'org.kevoree.Package') {
						//       console.log('add hash=' + modelElement.hashcode, 'name=' + modelElement.name, 'version=' + modelElement.version);
						//     }
						//     // if (this.isRelatedToPlatform(modelElement)) {
						//     //   cmds.push(this.createCommand(AddDeployUnit, modelElement));
						//     // }
						//     break;
						//
						//   case 'REMOVE':
						//     currentModel = this.node.getKevoreeCore().getCurrentModel();
						//     du = currentModel.findByPath(trace.objPath);
						//     if (du.eContainer().metaClassName() === 'org.kevore.Package') {
						//       console.log('remove hash=' + modelElement.hashcode, 'name=' + modelElement.name, 'version=' + modelElement.version);
						//     }
						//     // if (du) {
						//     //   cmds.push(this.createCommand(RemoveDeployUnit, du));
						//     // }
						//     break;
						// }
						break;

					case 'bindings':
						switch (trace.traceType.name()) {
							case 'ADD':
								if (this.isRelatedToPlatform(modelElement)) {
									if (!this.isVirtual(modelElement)) {
										cmds.push(this.createCommand(AddBinding, modelElement));
										cmds.push(this.createCommand(UpdateInstance, modelElement.hub));

										if (modelElement.hub && this.isRelatedToPlatform(modelElement.hub)) {
											if (!this.modelObjMapper.getObject(modelElement.hub.path())) {
												meta = modelElement.hub.typeDefinition.select('deployUnits[]/filters[name=platform,value=js]');
												if (meta.size() > 0) {
													du = meta.get(0).eContainer();
													if (!this.modelObjMapper.getObject(du.path())) {
														cmds.push(this.createCommand(AddDeployUnit, du));
													}
												} else {
													var e = new Error('no DeployUnit found for \'' + modelElement.hub.name + ': ' + modelElement.hub.typeDefinition.name + '/' + modelElement.hub.typeDefinition.version + '\' that matches the \'js\' platform');
													e.className = this.toString();
													throw e;
												}

												if (modelElement.hub.dictionary) {
													cmds = cmds.concat(this.createUpdateDictionaryCommands(modelElement.hub.dictionary));
												}

												var fragDics = modelElement.hub.fragmentDictionary.iterator();
												while (fragDics.hasNext()) {
													var fragDic = fragDics.next();
													if (fragDic.name === this.node.getName()) {
														cmds = cmds.concat(this.createUpdateDictionaryCommands(fragDic));
													}
												}

												cmds.push(this.createCommand(AddInstance, modelElement.hub));
												if (modelElement.hub.started) {
													cmds.push(this.createCommand(StartInstance, modelElement.hub));
												}

												var self = this;
												modelElement.hub.bindings.array.forEach(function (binding) {
													cmds.push(self.createCommand(AddBinding, binding));
												});
											}
										}
									}
								}
								break;

							case 'REMOVE':
								currentModel = this.node.getKevoreeCore().getCurrentModel(); // old model
								var binding = currentModel.findByPath(trace.objPath); // binding before removal trace
								if (binding) {
									var newChan = this.targetModel.findByPath(binding.hub.path());
									var chanStillUsed = false;
									if (newChan) {
										var bindings = newChan.bindings.iterator();
										while (bindings.hasNext()) {
											if (this.isRelatedToPlatform(bindings.next())) {
												// there is still a binding between this chan and this platform => cant remove
												chanStillUsed = true;
												break;
											}
										}
									}

									if (!chanStillUsed && this.modelObjMapper.getObject(binding.hub.path())) {
										if (this.modelObjMapper.getObject(binding.hub.path())) {
											cmds.push(this.createCommand(RemoveInstance, binding.hub));
										}

										if (binding.hub.started) {
											cmds.push(this.createCommand(StopInstance, binding.hub));
										}
									}
								}

								if (this.isRelatedToPlatform(binding)) {
									cmds.push(this.createCommand(RemoveBinding, binding));
									cmds.push(this.createCommand(UpdateInstance, binding.hub));
								}
								break;
						}
						break;

					case 'started':
						if (trace.traceType.name() === 'SET' && isInstance(modelElement)) {
							if (this.isRelatedToPlatform(modelElement)) {
								if (modelElement.metaClassName() === 'org.kevoree.ContainerNode' && modelElement.name === this.node.getName()) {
									if (trace.content === 'true') {
										// start this node platform
										cmds.push(this.createCommand(StartInstance, modelElement));
									} else {
										// stop this node platform
										cmds.push(this.createCommand(HaraKiri, modelElement));
									}
								} else {
									if (trace.content === 'true') {
										cmds.push(this.createCommand(StartInstance, modelElement));
										if (!modelElement.host) {
											if (modelElement.dictionary) {
												var updateDicCmds = this.createUpdateDictionaryCommands(modelElement.dictionary);
												if (updateDicCmds.length > 0) {
													cmds = cmds.concat(updateDicCmds);
													cmds.push(this.createCommand(UpdateInstance, modelElement));
												}
											}

											var elemFragDics = modelElement.fragmentDictionary.iterator();
											while (elemFragDics.hasNext()) {
												var fDic = elemFragDics.next();
												if (fDic.name === this.node.getName()) {
													var updateFDicCmds = this.createUpdateDictionaryCommands(fDic);
													if (updateFDicCmds.length > 0) {
														cmds = cmds.concat(updateFDicCmds);
														cmds.push(this.createCommand(UpdateInstance, modelElement));
													}
												}
											}
										}
									} else {
										if (modelElement.host && modelElement.host.name === this.node.getName()) {
											// modelElement is an hosted node (so it does not have an instance in this platform)
											cmds.push(this.createCommand(StopInstance, modelElement));

										} else {
											instance = this.modelObjMapper.getObject(modelElement.path());
											if (instance && instance.isStarted()) {
												cmds.push(this.createCommand(StopInstance, modelElement));
											}
										}
									}
								}
							}
						}
						break;

					case 'value':
						if (trace.traceType.name() === 'SET' &&
							modelElement.metaClassName() === 'org.kevoree.Value' &&
							modelElement.eContainer().metaClassName() === 'org.kevoree.Dictionary') {
							if (this.isRelatedToPlatform(modelElement)) {
								instance = modelElement.eContainer().eContainer();
								if (instance.started && !instance.host) {
									var updateDicAttrs = this.createUpdateDictionaryCommands(modelElement.eContainer());
									if (updateDicAttrs.length > 0) {
										cmds = cmds.concat(updateDicAttrs);
										cmds.push(this.createCommand(UpdateInstance, modelElement.eContainer().eContainer()));
									}
								}
							}
						}
						break;

					case 'typeDefinition':
						switch (trace.traceType.name()) {
							case 'ADD':
								currentModel = this.node.getKevoreeCore().getCurrentModel();
								currentModelElement = currentModel.findByPath(trace.srcPath);
								if (currentModelElement) {
									targetModelElement = this.targetModel.findByPath(trace.srcPath);
									if (this.isRelatedToPlatform(currentModelElement)) {
										if (currentModelElement.path() === this.node.getPath()) {
											// this adaptation means: to change this node platform TypeDefinition
											// TODO this should be checked and handled in the core.. not here
										} else {
											meta = modelElement.select('deployUnits[]/filters[name=platform,value=js]');
											if (meta.size() > 0) {
												du = meta.get(0).eContainer();
												if (!this.modelObjMapper.getObject(du.path())) {
													cmds.push(this.createCommand(AddDeployUnit, du));
												}

												instance = this.modelObjMapper.getObject(currentModelElement.path());
												if (instance) {
													// instance found in the node map
													if (instance.started) {
														// stop instance
														cmds.push(this.createCommand(StopInstance, currentModelElement));
													}

													if (currentModelElement.metaClassName() === 'org.kevoree.Channel') {
														// remove old bindings
														currentModelElement.bindings.array.forEach(function (b) {
															cmds.push(this.createCommand(RemoveBinding, b));
														}.bind(this));
														// add new bindings
														targetModelElement.bindings.array.forEach(function (b) {
															cmds.push(this.createCommand(AddBinding, b));
														}.bind(this));

													} else if (currentModelElement.metaClassName() === 'org.kevoree.ComponentInstance') {
														// remove old input port bindings
														currentModelElement.provided.array.forEach(function (input) {
															input.bindings.array.forEach(function (b) {
																cmds.push(this.createCommand(RemoveBinding, b));
															}.bind(this));
														}.bind(this));
														// remove old outout port bindings
														currentModelElement.required.array.forEach(function (output) {
															output.bindings.array.forEach(function (b) {
																cmds.push(this.createCommand(RemoveBinding, b));
															}.bind(this));
														}.bind(this));

														// add new input port bindings
														targetModelElement.provided.array.forEach(function (input) {
															input.bindings.array.forEach(function (b) {
																cmds.push(this.createCommand(AddBinding, b));
															}.bind(this));
														}.bind(this));
														// add new outout port bindings
														targetModelElement.required.array.forEach(function (output) {
															output.bindings.array.forEach(function (b) {
																cmds.push(this.createCommand(AddBinding, b));
															}.bind(this));
														}.bind(this));
													}

													// TODO upgradeInstance ?

													//reinject dictionary
													this.createUpdateDictionaryCommands(targetModelElement.dictionary);

													//restart
													cmds.push(this.createCommand(StartInstance, targetModelElement));
												} else {
													// TODO hmm => what to do then ?
												}
											} else {
												var error = new Error('no DeployUnit found for \'' + modelElement.name + ': ' + modelElement.typeDefinition.name + '/' + modelElement.typeDefinition.version + '\' that matches the \'js\' platform');
												error.className = this.toString();
												throw error;
											}
										}
									}
								}
								break;

							case 'REMOVE':
								//console.log('>>>>> REMOVE TypeDef', modelElement.path());
								break;
						}

						break;
				}
			}
		}

		return cmds;
	},

	/**
	 * know if an modelElement is related to the current plarform node
	 * @param element
	 * @returns {boolean}
	 */
	isRelatedToPlatform: function (element) {
		if (element) {
			if (element.metaClassName() === 'org.kevoree.ComponentInstance') {
				// if parent is this node platform: it's ok
				return (element.eContainer().name === this.node.getName());

			} else if (element.metaClassName() === 'org.kevoree.Channel') {
				// if this channel has bindings with components hosted in this node platform: it's ok
				var bindings = element.bindings.iterator();
				while (bindings.hasNext()) {
					var binding = bindings.next();
					if (binding.port && binding.port.eContainer()) {
						if (this.isRelatedToPlatform(binding.port.eContainer())) {
							return true;
						}
					}
				}

			} else if (element.metaClassName() === 'org.kevoree.Group') {
				return element.subNodes.array.some(function (node) {
					return this.isRelatedToPlatform(node);
				}.bind(this));

			} else if (element.metaClassName() === 'org.kevoree.ContainerNode') {
				return ((element.name === this.node.getName()) || (element.host && element.host.name === this.node.getName()));

			} else if (element.metaClassName() === 'org.kevoree.MBinding') {
				if (element.port && element.port.eContainer()) {
					if (this.isRelatedToPlatform(element.port.eContainer())) {
						return true;
					}
				}
				if (element.hub) {
					return this.isRelatedToPlatform(element.hub);
				}

			} else if (element.metaClassName() === 'org.kevoree.Value') {
				if (element.eContainer().metaClassName() === 'org.kevoree.FragmentDictionary') {
					return (element.eContainer().name === this.node.getName());
				} else {
					return this.isRelatedToPlatform(element.eContainer().eContainer());
				}

			} else if (element.metaClassName() === 'org.kevoree.Port') {
				return this.isRelatedToPlatform(element.eContainer());
			}
		}
		return false;
	},

	/**
	 *
	 * @param Cmd
	 * @param element
	 * @returns {Object}
	 */
	createCommand: function (Cmd, element) {
		return new Cmd(this.node, this.modelObjMapper, this.targetModel, element);
	},

	/**
	 *
	 * @param kDic
	 * @returns {Array}
	 */
	createUpdateDictionaryCommands: function (kDic) {
		var cmds = [],
			dictionary = null;

		var entityInstance;
		if (kDic.eContainer().path() === this.node.getPath()) {
			entityInstance = this.node;
		} else {
			entityInstance = this.modelObjMapper.getObject(kDic.eContainer().path());
		}
		if (entityInstance) {
			dictionary = entityInstance.getDictionary();
		}
		var values = kDic.values.iterator();
		while (values.hasNext()) {
			var val = values.next();
			if (dictionary) {
				var oldVal = dictionary.getValue(val.name);
				if (oldVal !== val.value) {
					cmds.push(this.createCommand(UpdateDictionary, val));
				}
			} else {
				cmds.push(this.createCommand(UpdateDictionary, val));
			}
		}

		return cmds;
	},

	/**
	 * @param elem Instance | TypeDefinition | MBinding
	 * @returns true if the given element has a virtual TypeDefinition
	 */
	isVirtual: function (elem) {
		if (isInstance(elem)) {
			return this.isVirtual(elem.typeDefinition);
		} else if (isTypeDefinition(elem)) {
			var virtual = elem.findMetaDataByID('virtual');
			return virtual !== null;
		} else if (elem.metaClassName() === 'org.kevoree.MBinding') {
			if (elem.hub) {
				if (this.isVirtual(elem.hub.typeDefinition)) {
					return true;
				}
			}
			if (elem.port) {
				return this.isVirtual(elem.port.eContainer());
			}

		}
		return false;
	},

	/**
	 * Sorts primitives array according to COMMAND_RANK
	 * @param list
	 * @returns {*}
	 */
	sortCommands: function (list) {
		list.sort(function (a, b) {
			if (COMMAND_RANK[a.toString()] > COMMAND_RANK[b.toString()]) {
				return 1;
			} else if (COMMAND_RANK[a.toString()] < COMMAND_RANK[b.toString()]) {
				return -1;
			} else {
				return 0;
			}
		});

		return list;
	},

	setLogger: function (logger) {
		this.log = logger;
	}
};

module.exports = AdaptationEngine;
