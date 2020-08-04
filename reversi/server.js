#!/usr/bin/node
/*
 * Kitty Elliott
 * CSC 337
 * Final Project: "Reversi"
 * 	a web app for playing Reversi/Othello
 */

// module imports
const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const { promisify } = require("util");
const { Account, Session, Game } = require("./db_models.js");

// convert callback fn to promise-y async fn 
const pbkdf2 = promisify(crypto.pbkdf2);

// constants
const PORT = process.env.PORT == undefined
	? '80'
	: process.env.PORT;
const DB_HOST = "localhost";
const DB_PORT = "27017";
const DB_NAME = "reversi";
const HS_ITERATIONS = 1000;
const SESSION_TIMEOUT = 1200000;
const GUEST_GAME_TIMEOUT = 600000;
const CLEANUP_INTERVAL = 120000;
const UNAUTH_LANDING = "/index.html?unauthorized"
const SESSION_EXPIRY_MSG = "Session expired.";
const SESSION_404_MSG = "Session not found.";

async function createAccount(username, password) {
	let salt = crypto.randomBytes(64);
	let hash = await pbkdf2(
		password, salt, HS_ITERATIONS, 64, "sha512"
	);
	return new Account({ username, salt, hash }).save();
}

// returns the farthest point in the past before
// which a sesssion would be considered expired
function oldestAllowedSessionTime() {
	return Date.now() - SESSION_TIMEOUT;
}

// returns the farthest point in the past before
// which a guest-only game would be considered expired
function oldestAllowedGOGTime() {
	return Date.now() - GUEST_GAME_TIMEOUT;
}

// fires off an async task to clean expired sessions from the database
// and an async task to clean expired guest-only games from the database
function cleanup() {
	Session.deleteMany({ lastActive: { $lt: oldestAllowedSessionTime() } })
		.exec()
		.then(result => result.nDeleted > 0
				? console.log(`deleted ${result.nDeleted} expired sessions`)
				: undefined
		).catch(console.error);
	
	Game.deleteMany({ p1: null, lastPlayMadeAt: { $lt: oldestAllowedGOGTime() } })
		.exec()
		.then(result => result.nDeleted > 0
				? console.log(`deleted ${result.nDeleted} expired games`)
				: undefined
		).catch(console.error);
}

// create a new session for the given account.
// saves the session to the database and then sets the
// response's "session" cookie. The session document
// is returned. May throw an error if the session
// could not be saved for some reason.
async function createSession(account, response) {
	let session = await new Session({ user: account })
		.save();
	response.cookie("session", {
		uid: account._id,
		sid: session._id,
	}, { maxAge: SESSION_TIMEOUT });
	return session;
}

// returns the validated session as identified by the "session"
// cookie of the given cookies object. If the session could not be
// validated, then an error is thrown. If the session was found, then
// its lastActive property is updated, and thus this function might
// also throw an error if that update could not be saved to the database.
// the session's "user" field will be populated.
async function getValidatedSession(cookies) {
	let { session: cookie } = cookies;
	if (cookie == undefined
		|| cookie.sid == undefined
		|| cookie.uid == undefined) {
		throw new Error("Missing cookie(s)");
	}
	let session = await Session.findOne({
		_id: cookie.sid,
		user: cookie.uid,
	})
		.populate("user")
		.exec();

	if (session == null) {
		throw new Error(SESSION_404_MSG);
	} else if (session.lastActive.getTime() < oldestAllowedGOGTime()) {
		throw new Error(SESSION_EXPIRY_MSG);
	} else {
		session.lastActive = Date.now();
		return session.save();
	}
}

// returns true iff the given password matches the salt and hash
// for the given account.
async function isValidLogin(account, password) {
	let { salt, hash: stored } = account;
	let calcd = await pbkdf2(password, salt, HS_ITERATIONS, 64, "sha512");
	// compare hashes
	return stored.equals(calcd);
}

// response handler for account registration
async function registrationHandler(req, res) {
	let { username, password } = req.body;
	if (username == undefined || password == undefined) {
		res.status(400).send("Missing username or password");
	} else try {
		await createAccount(username, password)
			.then(acct => createSession(acct, res));
		res.sendStatus(201);
	} catch (err) {
		if (err.code == 11000) { // violation of "unique" constraint
			res.status(409)
				.send(`Username already taken: ${username}`);
		} else {
			console.error(err);
			res.sendStatus(500);
		}
	}
}

// response handler for account login
async function loginHandler(req, res) {
	let { username, password } = req.body;
	username = username.trim().toLowerCase();
	if (username == undefined || password == undefined) {
		res.status(400).send("Missing username or password");
	} else try {
		let account = await Account.findOne({ username }).exec();
		if (account != null 
			&& await isValidLogin(account, password)) {
			await createSession(account, res);
			res.sendStatus(200);
		} else {
			res.status(403).send("Incorrect username or password")
		}
	} catch (err) {
		console.error(err);
		res.sendStatus(500);
	}
}

async function getMyGamesHandler(req, res) {
	try {
		let { games } = await getValidatedSession(req.cookies)
			.then(s => s.user.execPopulate({
				path: "games",
				select: "-board",
			}));
		res.json(games);
	} catch (err) {
		if (err instanceof mongoose.Error) {
			res.sendStatus(500)
		} else {
			res.status(403).send(err.message);
		}
		return;
	}
}

// request handler for POST request to create a new game
async function createGameHandler(req, res) {
	let { foe, cpu: hasCPU } = req.body;
	let p1 = getValidatedSession(req.cookies)
		.then(s => s.user)
		.catch(err => {
			if (err.message == SESSION_404_MSG) {
				return null;
			} else {
				throw err;
			}
		});

	if (hasCPU || foe == undefined) {
		p2 = null;
	} else {
		p2 = Account.findOne({ username: foe.trim().toLowerCase() })
			.exec()
			.then(result => {
				// Because p2 == null indicates a CPU or guest
				// opponent, throw an error if p2 username not found
				if (result == null) {
					throw new Error(`opponent "${foe}" not found`);
				} else {
					return result;
				}
			});
	}
	try {
		// await loading the players
		[ p1, p2 ] = await Promise.all([ p1, p2 ]);
		// create the game
		let game = await new Game({ p1, p2, hasCPU })
			.save();
		// add game to the player documents
		p1.games.push(game);
		p1 = p1.save();
		if (p2 != null) {
			p2.games.push(game);
			p2 = p2.save();
		}
		// (a)wait for player docs to save
		await Promise.all([ p1, p2 ]);
		// res.status(201).send(game._id);
		res.status(201).redirect(
			`/play.html?gid=${encodeURIComponent(game._id)}`
		);
	} catch (err) {
		if (err instanceof mongoose.Error) {
			console.error(err);
			res.sendStatus(500);
		} else {
			res.status(400).send(err.message);
		}
	}
}

async function main() {
	const app = express()
		// middleware
		.use(express.json())
		.use(express.urlencoded({ extended: true }))
		.use(cookieParser())
		// routes
		.post("/register", registrationHandler)
		.post("/login", loginHandler)
		.get("/games/mine", getMyGamesHandler)
		// .get("/games/:gameId", getGameHandler)
		.post("/games/create", createGameHandler)
		// .post("/games/:gameId/leave", leaveGameHandler)
		// .post("/games/:gameId/move", gameMoveHandler)
		.use("/", express.static("public_html"))
	; // end of express app chain
	mongoose.connection.on("error", console.error);
	try {
		await mongoose.connect(
			`mongodb://${DB_HOST}:${DB_PORT}/${DB_NAME}`,
			{ useNewUrlParser: true, useUnifiedTopology: true }
		);
		cleanup();
		setInterval(cleanup, CLEANUP_INTERVAL);
		app.listen(PORT);
	} catch (err) {
		console.error(err);
	}
}

if (require.main === module) {
	main();
}
