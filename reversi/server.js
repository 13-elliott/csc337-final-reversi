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
const CLEANUP_INTERVAL = 120000;
const UNAUTH_LANDING = "/index.html?unauthorized"

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

// fires off an async task to clean expired sessions from the database.
function cleanup() {
	Session.deleteMany({ lastActive: { $lt: oldestAllowedSessionTime() } })
		.exec()
		.then(result => result.nDeleted > 0
				? console.log(`deleted ${result.nDeleted} expired sessions`)
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
async function validateSession(cookies) {
	let { session: cookie } = cookies;
	if (cookie == undefined
		|| cookie.sid == undefined
		|| cookie.uid == undefined) {
		throw new Error("Missing cookie(s)");
	}
	let session = await Session.findOne({
		_id: cookie.sid,
		user: cookie.uid,
		lastActive: { $gte: oldestAllowedSessionTime() },
	})
		.populate("user")
		.exec();

	if (session == null) {
		throw new Error("Session not found or expired");
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
		res.sendStatus(200);
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
		if (account == null) {
			res.status(404).send(`No such user "${username}"`);
		} else if (await isValidLogin(account, password)) {
			await createSession(account, res);
			res.sendStatus(200);
		}
	} catch (err) {
		console.error(err);
		res.sendStatus(500);
	}
}

async function authenticationHandler(req, res, next) {
	try {
		await validateSession(req.cookies);
	} catch (err) {
		console.error(err);
		if (err instanceof mongoose.Error) {
			res.sendStatus(500);
		} else {
			res.status(403).redirect(UNAUTH_LANDING);
		}
		return;
	}
	next();
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
		.get("/", authenticationHandler)
		.use("/", express.static("public_html"))
	; // end of express app chain
	mongoose.connection.on("error", console.error);
	try {
		await mongoose.connect(
			`mongodb://${DB_HOST}:${DB_PORT}/${DB_NAME}`,
			{ useNewUrlParser: true, useUnifiedTopology: true }
		);
		setInterval(cleanup, CLEANUP_INTERVAL);
		app.listen(PORT);
	} catch (err) {
		console.error(err);
	}
}

if (require.main === module) {
	main();
}