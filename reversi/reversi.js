/*
 * Kitty Elliott
 * CSC 337
 * Final Project: "Reversi"
 * 	reversi game logic
 */

// imports
const assert = require("assert");

// constants
const BOARD_DIM = 8;
const P1_TOKEN = "B";
const P2_TOKEN = "W";
const TOKEN_VALS = [P1_TOKEN, P2_TOKEN, null];

// assertions re: constants
assert(BOARD_DIM % 2 == 0);
assert(BOARD_DIM > 2);


// Represents the board state of a game of Reversi.
// not meant to be intantiated, but to be loaded into
// a mongoose class schema with a `tokens` property
// which is a (sparse) array of token values
class Board {

	static newTokenArray() {
		let dummy = { tokens: new Array(BOARD_DIM ** 2) };
		dummy.tokens.set = function(i, e) { this[i] = e };
		let mid = (BOARD_DIM / 2) - 1;
		// starting positions
		setTokenAt.call(dummy, mid    , mid    , P2_TOKEN);
		setTokenAt.call(dummy, mid + 1, mid    , P1_TOKEN);
		setTokenAt.call(dummy, mid    , mid + 1, P1_TOKEN);
		setTokenAt.call(dummy, mid + 1, mid + 1, P2_TOKEN);
		return dummy.tokens;
	}

	getTokenAt(x, y) {
		let i = coordsToIdx(x, y);
		return this.tokens[i];
	}

	takeCompTurns() {
		do {
			let move = genCompMove.call(this);
			if (move.length == 0) {
				return "GAME_OVER";
			} else {
				let {x, y} = move.pop();
				applyMove.call(this, x, y, P2_TOKEN, move);
			}
		} // keep taking CPU turns while P1 cannot move
		while (!this.getPossibleMoves(P1_TOKEN));
	}

	takePlayerTurn(x, y, playerToken) {
		validateTokenVal(playerToken);
		let flips = getSpacesToFlip.call(this, x, y, playerToken);
		if (flips.length == 0) {
			throw new Error(`Illegal Move`);
		} else {
			applyMove.call(this, x, y, playerToken, flips);
		}
	}

	getPossibleMoves(playerToken) {
		let possibleMoves = [];
		for (let x = 0; x < BOARD_DIM; x++) {
			for (let y = 0; y < BOARD_DIM; y++) {
				if (getSpacesToFlip.call(this, x, y, playerToken).length > 0)
					possibleMoves.push({ x, y })
			}
		}
		return possibleMoves.length == 0 ? null : possibleMoves;
	}

	get p1Score() {
		return countOccurrences(this.tokens, P1_TOKEN);
	}

	get p2Score() {
		return countOccurrences(this.tokens, P2_TOKEN);
	}

	get gameIsOver() {
		let r = !this.getPossibleMoves(P1_TOKEN) && !this.getPossibleMoves(P2_TOKEN);
		return r;
	}
}

// "Private static methods" --

function validateCoords(x, y) {
	if (Number.isInteger(x) && Number.isInteger(y)) {
		if (x < 0 || BOARD_DIM <= x || y < 0 || BOARD_DIM <= y) {
			throw new RangeError(
				`both must be in 0..=${BOARD_DIM -1}: (${x}, ${y})`
			);
		}
	} else {
		throw new TypeError(`both must be ints: (${x}, ${y})`);
	}
}

function validateTokenVal(token) {
	if (token == undefined || !TOKEN_VALS.includes(token)) {
		throw new Error(
			`Token must be one of [${TOKEN_VALS.map(String)}]: ${String(token)}`
		);
	}
}

function coordsToIdx(x, y) {
	validateCoords(x, y);
	return (y * BOARD_DIM) + x;
}

// return a count of how many times `value` strictly appears in `arr`
function countOccurrences(arr, value) {
	return arr.reduce(
		(accum, elem) => elem === value
			? accum + 1
			: accum,
		0 // initial accum value
	);
}

// "Private instance methods" --

function setTokenAt(x, y, value) {
	let i = coordsToIdx(x, y);
	validateTokenVal(value)
	this.tokens.set(i, value);
}

function flipTokenAt(x, y) {
	let i = coordsToIdx(x, y);
	switch (this.tokens[i]) {
		case P1_TOKEN:
			this.tokens.set(i, P2_TOKEN);
			break;
		case P2_TOKEN:
			this.tokens.set(i, P1_TOKEN);
			break;
		default:
			throw new Error(
				`Tried to flip empty space: (${x}, ${y})`
			);
	}
}

function applyMove(x, y, playerToken, toFlip) {
	setTokenAt.call(this, x, y, playerToken);
	for (let {x, y} of toFlip) {
		flipTokenAt.call(this, x, y);
	}
}

function getSpacesToFlip(x, y, token) {
	let flips = [];
	if (this.getTokenAt(x, y) != undefined) {
		return flips;
	}
	for (let i = -1; i <= 1; i++) {
		for (let j = -1; j <= 1; j++) {
			flips.push(...getSandwiched.call(this, x, y, token, i, j));
		}
	}
	return flips;
}

function getSandwiched(startX, startY, breadToken, xIncr, yIncr) {
	if (xIncr == 0 && yIncr == 0) {
		return [];
	}
	let x = startX + xIncr;
	let y = startY + yIncr;
	if (x < 0 || BOARD_DIM <= x || y < 0 || BOARD_DIM <= y) {
		return [];
	}

	let sandwiched = [];
	do {
		let token = this.getTokenAt(x, y);
		if (token == undefined) {
			break;
		} else if (token == breadToken) {
			return sandwiched;
		} else {
			sandwiched.push({ x, y });
		}
		x += xIncr;
		y += yIncr;
	} while (0 <= x && x < BOARD_DIM && 0 <= y && y < BOARD_DIM);
	// either fell out of bounds or reached an empty space
	// without finding another bread token
	return [];
}

function genCompMove() {
	let longest = [];
	let max = 0;
	for (let x = 0; x < BOARD_DIM; x++) {
		for (let y = 0; y < BOARD_DIM; y++) {
			let move = getSpacesToFlip.call(this, x, y, P2_TOKEN);
			if (max < move.length) {
				longest = move;
				max = longest.length;
				// put initiating move at the end
				longest.push({ x, y });
			}
		}
	}
	return longest;
}


module.exports = {
	BOARD_DIM,
	P1_TOKEN, P2_TOKEN,
	TOKEN_VALS,
	Board
};