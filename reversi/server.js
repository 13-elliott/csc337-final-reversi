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
const { P1_TOKEN, P2_TOKEN } = require("./reversi.js");

// convert callback fn to promise-y async fn 
const pbkdf2 = promisify(crypto.pbkdf2);

// constants
const PORT = process.env.PORT == undefined
	? '80'
	: process.env.PORT;
const DB_HOST = "localhost";
const DB_PORT = "27017";
const DB_NAME = "reversi";
const USERNAME_PATTERN = /^[\w\d_]+$/;
const PASSWORD_MIN_LEN = 8;
const HS_ITERATIONS = 1000;
const SESSION_TIMEOUT = 1200000; // 20 min
const GAME_TIMEOUT = 600000; // 10 min
const CLEANUP_INTERVAL = 120000; // 2 min
const USER_POP_SELECT = "-hash -salt -games -__v";

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
	return Date.now() - GAME_TIMEOUT;
}

// fires off an async task to clean expired sessions from the database
// and an async task to clean expired guest-only games from the database
function cleanup() {
	Session.deleteMany({ lastActive: { $lt: oldestAllowedSessionTime() } })
		.exec()
		.then(result => result.deletedCount > 0
				? console.log(`deleted ${result.deletedCount} expired sessions`)
				: undefined
		).catch(console.error);
	
	Game.deleteMany({
			p1: null,
			p2: null,
			lastPlayMadeAt: { $lt: oldestAllowedGOGTime() },
		})
		.exec()
		.then(result => result.deletedCount > 0
				? console.log(`deleted ${result.deletedCount} expired/abdandoned games`)
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
async function getValidatedSession(req, res) {
	let { session: cookie } = req.cookies;
	if (cookie == undefined
		|| cookie.sid == undefined
		|| cookie.uid == undefined) {
		throw new Error("Missing cookie(s)");
	}
	let session = await Session.findOne({
		_id: cookie.sid,
		user: cookie.uid,
		lastActive: { $gte: oldestAllowedSessionTime() }
	})
		.populate("user")
		.exec();

	if (session == null) {
		throw new Error("Session not found or expired");
	} else {
		res.cookie("session", cookie, 
			{ maxAge: SESSION_TIMEOUT }
		);
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

function isValidUsername(username) {
	return username.match(USERNAME_PATTERN)
}

function isValidPassword(password) {
	return password.length >= PASSWORD_MIN_LEN
}

// response handler for account registration
async function registrationHandler(req, res) {
	let { username, password } = req.body;
	if (username == undefined || password == undefined) {
		res.status(400).send("Missing username or password");
	} else if (!isValidUsername(username)) {
		res.status(400).send("Invalid username")
	} else if (!isValidPassword(password)) {
		res.status(400).send("Invalid password")
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

// response handler for GET /games
async function getMyGamesHandler(req, res) {
	try {
		let { games } = await getValidatedSession(req, res)
			.then(s => s.user.execPopulate("games"))
			.then(u => u
				.populate({ path: "games.p1", select: USER_POP_SELECT })
				.populate({ path: "games.p2", select: USER_POP_SELECT })
				.execPopulate()
			);
		res.json(games.map(g => { return {
			id: g._id,
			p1: {
				score: g.board.p1Score,
				name: g.p1 == null ? null : g.p1.username,
			},
			p2: {
				score: g.board.p2Score,
				name: g.p2 == null ? null : g.p2.username,
			},
			abandoned: g.abandoned,
			hasCPU: g.hasCPU,
			lastAction: g.lastPlayMadeAt,
			curTurn: g.curTurn,
		}}));
	} catch (err) {
		if (err instanceof mongoose.Error) {
			res.sendStatus(500)
		} else {
			res.status(403).send(err.message);
		}
		return;
	}
}

// returns which player number the given user is is in the given game
// or null if the given user is not in the given game
function whichPlayerNumber(game, user) {
	if (game.p1 == null) {
		if (game.abandoned) {
			if (game.p2 != null && game.p2.equals(user)) {
				return 2;
			} else {
				return null;
			}
		} else {
			return 1;
		}
	} else if (user == null) {
		if (game.hasCPU || game.abandoned || game.p2 != null) {
			return null;
		} else {
			return 2;
		}
	} else if (user.equals(game.p1)) {
		return 1;
	} else if (user.equals(game.p2)) {
		return 2;
	} else {
		return null;
	}
}

// returns a promise which resolves to the active, logged-in account
// or null if there is no active, logged in account.
// it is possible for the promise to reject by throwing a mongoose Error
async function getActiveAccountNullable(req, res) {
	return getValidatedSession(req, res)
		.then(s => s.user)
		.catch(err => {
			if (err instanceof mongoose.Error) {
				throw err;
			} else {
				return null;
			}
		});
}

// convenience function for finding a game by its id,
// while also projecting to remove __id and __v fields and populating
// the p1 and p2 fields with the projection described by USER_POP_SELECT
async function getGameById(gid) {
	return Game.findById(gid)
		.select("-__id -__v")
		.populate("p1", USER_POP_SELECT)
		.populate("p2", USER_POP_SELECT)
		.exec();
}

// wraps some action in the logic for authenticating a request
// related to a specific game.
// req and res are the request and response objects
// callback is a function which takes an object containing the
// validated game object, "game", and the non-null return value of
// whichPlayerNumber(), "pNum",
async function wrapGameAuthentication(req, res, callback) {
	let player = getActiveAccountNullable(req, res);
	try {
		let game = await getGameById(req.params.gid);
		if (game == null) {
			res.status(404).send("Game not found");
			player.catch(console.error);
		} else {
			player = await player;
			let pNum = whichPlayerNumber(game, player);
			if (pNum) {
				await callback({ game, pNum });
			} else {
				res.sendStatus(403);
			}
		}
	} catch (err) {
		if (err instanceof mongoose.Error) {
			if (err.name == "CastError") {
				res.sendStatus(400);
			} else {
				console.error(err);
				res.sendStatus(500);
			}
		} else {
			res.status(400).send(err.message);
		}
	}
}

// handler for GET /games/:gid
async function getGameHandler(req, res) {
	return wrapGameAuthentication(req, res, ({ game, pNum }) => {
		let pToken = pNum == 1 ? P1_TOKEN : P2_TOKEN;
		res.status(200).json({
			p1: {
				score: game.board.p1Score,
				name: game.p1 == null ? null : game.p1.username,
			},
			p2: {
				score: game.board.p2Score,
				name: game.p2 == null ? null : game.p2.username,
			},
			pNum,
			abandoned: game.abandoned,
			hasCPU: game.hasCPU,
			lastAction: game.lastPlayMadeAt,
			curTurn: game.curTurn,
			possibleMoves: game.board.getPossibleMoves(pToken),
			board: game.board.tokens,
		})
	});
}

// request handler for POST /games
async function createGameHandler(req, res) {
	let { p2: p2name, cpu } = req.body;
	let p1 = getActiveAccountNullable(req, res);
	let p2;
	if (cpu || !p2name) {
		p2 = null;
	} else {
		p2 = Account.findOne({ username: p2name.trim().toLowerCase() })
			.exec()
			.then(result => {
				// Because p2 == null indicates a CPU or guest
				// opponent, throw an error if p2 username not found
				if (result == null) {
					throw new Error(`opponent "${p2name}" not found`);
				} else {
					return result;
				}
			});
	}
	try {
		// await loading the players
		[ p1, p2 ] = await Promise.all([ p1, p2 ]);
		if (p1 != null && p1.equals(p2)) {
			res.status(400).send("Cannot play a game against yourself!");
			return;
		}
		// create the game
		let game = await new Game({ p1, p2, hasCPU: Boolean(cpu) })
			.save();
		// add game to the player documents
		if (p1 != null) {
			p1.games.push(game);
			p1 = p1.save();
		}
		if (p2 != null) {
			p2.games.push(game);
			p2 = p2.save();
		}
		// (a)wait for player docs to save
		await Promise.all([ p1, p2 ]);
		res.status(201).send(game._id);
	} catch (err) {
		if (err instanceof mongoose.Error) {
			console.error(err);
			res.sendStatus(500);
		} else {
			res.status(400).send(err.message);
		}
	}
}

// handler for requests to DELETE /games/:gid
// for leaving a game
async function leaveGameHandler(req, res) {
	// remove the given game from the given player's .games
	// property and then save the player if the player is not null
	async function removeFromGames(player, gameToRemove) {
		if (player == null) {
			return null;
		} else {
			let i = player.games.indexOf(gameToRemove._id);
			if (i != -1) {
				player.games.splice(i, 1);
				return player.save();
			} else {
				return player;
			}
		}
	}

	return wrapGameAuthentication(req, res, async ({ game, pNum }) => {
		let {p1, p2} = await game.populate("p1")
			.populate("p2")
			.execPopulate();
		game.set(`p${pNum}`, null);
		game.set("abandoned", true)
		await game.save();
		if (pNum == 1) {
			await removeFromGames(p1, game)
		} else {
			await removeFromGames(p2, game)
		}
		res.sendStatus(200);
	});
}

// handler for requests to POST /games/:gid
// for submitting a move to a game
async function gameMoveHandler(req, res) {
	return wrapGameAuthentication(req, res, async ({ game, pNum }) => {
		let x = Number(req.body.x),
			y = Number(req.body.y)
		if (x == NaN || y == NaN) {
			res.status(400).send("x and y must be numbers")
			return
		}
		try {
			if (game.abandoned) {
				res.status(409).send("Game was abandoned by the other player");
				return;
			} else if (game.curTurn == 0) {
				res.status(409).send("Game is over!");
				return;
			} else if (pNum == game.curTurn) {
				if (pNum == 1) {
					game.board.takePlayerTurn(x, y, P1_TOKEN);
					if (game.hasCPU) {
						let gameOver = game.board.takeCompTurns();
						if (gameOver) {
							game.curTurn = 0;
						}
					} else if (game.board.getPossibleMoves(P2_TOKEN)) {
						game.curTurn = 2;
					} else if (!game.board.getPossibleMoves(P1_TOKEN)) {
						game.curTurn = 0;
					}
				} else { // pNum == 2
					game.board.takePlayerTurn(x, y, P2_TOKEN);
					if (game.board.getPossibleMoves(P1_TOKEN)) {
						game.curTurn = 1;
					} else if (!game.board.getPossibleMoves(P2_TOKEN)) {
						game.curTurn = 0;
					}
				}
			} else {
				res.status(409).send("Not your turn!");
				return;
			}
		} catch (err) {
			res.status(409).send(err.message);
			return;
		}
		game.lastPlayMadeAt = Date.now();
		await game.save();
		res.sendStatus(200);
	});
}

// handler for requests to GET /activeusers
// responds with a list of all users with currently
// active sessions
async function getActiveUsersHandler(req, res) {
	try {
		let usernameSet = await Session
			.find({ lastActive: { $gte: oldestAllowedSessionTime() } })
			.sort("-lastActive")
			.populate("user", "username")
			.exec()
			.then(sessions => new Set(sessions.map(s => s.user.username)))
		res.json([...usernameSet]);
	} catch (err) {
		console.error(err)
		res.sendStatus(500)
	}
}

// request handler for GET /logout
async function logoutHandler(req, res) {
	if (req.cookies.session != undefined) {
		await Session.findByIdAndDelete(req.cookies.session.sid)
			.exec()
			.then(_ => res.status(200))
			.catch((...errs) => {
				res.status(500);
				console.error(...errs);
			})
	}
	res.redirect("/index.html");
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
		.get("/logout", logoutHandler)
		.get("/activeusers", getActiveUsersHandler)
		.get("/username", (req, res) => getValidatedSession(req, res)
			.then(s => res.send(s.user.username))
			.catch(_ => res.sendStatus(403))
		)
		.get   ("/games", getMyGamesHandler)
		.post  ("/games", createGameHandler)
		.get   ("/games/:gid", getGameHandler)
		.post  ("/games/:gid", gameMoveHandler)
		.delete("/games/:gid", leaveGameHandler)
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
