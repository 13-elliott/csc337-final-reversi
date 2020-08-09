/*
 * Kitty Elliott
 * CSC 337
 * Final Project: "Reversi"
 * 	setup and export mongoose models
 */

// imports
const reversi = require("./reversi.js");
const { Schema, model } = require("mongoose");
const ObjectId = Schema.Types.ObjectId;

// Schemata --

const ACCOUNT_SCHEMA = new Schema({
	username: {
		required: true,
		unique: true,
		type: String,
		lowercase: true,
		trim: true,
	},
	salt: {
		required: true,
		type: Buffer,
	},
	hash: {
		required: true,
		type: Buffer,
	},
	games: [{
		type: ObjectId,
		ref: "Game",
	}],
});

const SESSION_SCHEMA = new Schema({
	user: {
		required: true,
		type: ObjectId,
		ref: "Account",
	},
	lastActive: {
		required: true,
		type: Date,
		default: _ => Date.now(),
	},
});

const BOARD_SCHEMA = new Schema({
	tokens: {
		required: true,
		type: [{
			type: String,
			enum: reversi.TOKEN_VALS,
		}],
		validate: t => t.length == reversi.BOARD_DIM ** 2,
	},
});
// loads the reversi.Board class such that
// any of its methods, getters, and setters
// can be called on an instance of a board document.
BOARD_SCHEMA.loadClass(reversi.Board);

const GAME_SCHEMA = new Schema({
	p1: { // iff p1 is null, then p1 is a guest
		required: false,
		type: ObjectId,
		ref: "Account",
	},
	p2: { // iff p2 is null, then p2 is an AI or guest
		required: false,
		type: ObjectId,
		ref: "Account",
		default: null,
	},
	hasCPU: { // iff hasCPU, then p2 is null
		required: false,
		type: Boolean,
		default: false,
	},
	curTurn: { // whose turn it is
		type: Number,
		enum: [0, 1, 2],
		default: 1,
	},
	abandoned: {
		required: false,
		type: Boolean,
		default: false,
	},
	lastPlayMadeAt: {
		required: true,
		type: Date,
		default: _ => Date.now(),
	},
	// a subdocument of type determined by BOARD_SCHEMA
	board: {
		required: true,
		type: BOARD_SCHEMA,
		default: { tokens: reversi.Board.newTokenArray() },
	},
});


module.exports = {
	Account: model("Account", ACCOUNT_SCHEMA),
	Session: model("Session", SESSION_SCHEMA),
	Game:    model("Game"   , GAME_SCHEMA   ),
};
