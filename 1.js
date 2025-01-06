'use strict';

module.exports = function permutater(options){

    const propType = Object.prototype.toString

    if( propType.call(options) != '[object Object]' )
        throw TypeError('options object required')

    if( typeof options.length != 'number' )
        throw TypeError('key length required')

    if( propType.call(options.characters) != '[object Array]' &&
        propType.call(options.charactersAt) != '[object Object]' )
        throw TypeError('array of characters needed')

    const characters = options.characters || []
    const charactersAt = options.charactersAt || {}
    const key_length = options.length
    const limit = options.limit

    let total_permutations = 1;

    // calculate total permutations based on the provided characters set
    for(let i = 0; i < key_length; i++){
        if( charactersAt[i] ){
            total_permutations *= charactersAt[i].length
        }else{
            total_permutations *= characters.length
        }
    }

    // by default, warn about too many permutations
    // 100,000 being a safe number
    if( typeof options.warn == 'undefined' &&
        total_permutations > 100000 &&
        ( typeof limit == 'undefined' || limit > 100000) ){

        console.warn('Permutation Warning: be aware that generating too many'+
        ' permutations is an intensive task which can lead to memory overflow')
        console.warn('Use options.limit to limit the number of results' +
        ' and options.warn to turn off this warning')
    }

    // warn about limit vs total possible permutations
    if( limit &&
        total_permutations < limit &&
        typeof options.warn == 'undefined' ){

        console.warn('Permutation Warning: Your desired limit is greather'+
        ' than the total possible permutations'+
        ` ( total: ${total_permutations} < limit: ${limit}) `)

        return generateAll(characters, charactersAt, key_length, '')
    }

    if( limit && limit == 1 ) return [generateOne(characters, charactersAt, key_length)]

    if( limit ) return generateWithLimit(characters, charactersAt, key_length, limit)

    // no limit, generate all
    return generateAll(characters, charactersAt, key_length, '');
}


function generateWithLimit(characters, charactersAt, key_length, limit){
    let result = []

    for( let i = 0; i < limit; i++ ){
        while(1){
            const new_key = generateOne(characters, charactersAt, key_length)
            if( result.indexOf(new_key) < 0 ){
                result.push( new_key );
                break;
            }
        }
    }
    return result;
}


function generateOne(characters, charactersAt, key_length){
    let result = '';
    for( let i = 0; i < key_length; i++){
        const chars = charactersAt[i] || characters
        const characters_length = chars.length
        result += characters[ Math.floor(Math.random()*characters_length) ]
    }
    return result;
}

function generateAll(characters, charactersAt, key_length, prefix){

    const prefix_length = prefix.length;
    const chars = charactersAt[prefix_length] || characters

    let result = [];

    for( let i = 0; i < chars.length; i++){

		let current_key = prefix + chars[i]

        if( prefix_length < key_length-1){
			result = result.concat( generateAll(characters, charactersAt, key_length, current_key) )
			continue;
		}
		result.push(current_key)
	}

    return result
}
