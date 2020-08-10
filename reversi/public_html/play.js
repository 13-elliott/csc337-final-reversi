const BOARD_DIM = 8
const POLL_INTERVAL = 1000
const GID = getGameId()
const ENDPOINT = `/games/${GID}`

// get the gid query parameter value
function getGameId() {
	let kv_pairs = window.location.search
		.substring(1)
		.split("&")
		.map(
			sub => sub.split("=", 2)
				.map(decodeURIComponent)
		)
	for (let [k, v] of kv_pairs)
		if (k == "gid")
			return v
	// if gid not found...
	return null
}

// fill the table #board with rows and columns
// the cells of the table have ids of form X_Y
// where X and Y are the x and y coordinates of
// that cell. Each cell also has the x and y values
// stored as .data() by jquery
function constructBoard() {
	let table = $("#board").empty()
	for (let y = 0; y < BOARD_DIM; y++) {
		let row = $(`<tr id="row${y}" />`)
		for (let x = 0; x < BOARD_DIM; x++) {
			let space = $(`<td id="${x}_${y}" />`)
				.data({ x, y })
			row.append(space)
		}
		table.append(row)
	}
}

// update the contents of the #board table with
// the contents of the given board array. The
// array contains "W", "B", and null values
// which correspond to white and black tokens,
// and empty spaces, respectively. All click
// events are removed from the table's cells.
function fillBoard(board) {
	for (let i = 0; i < board.length; i++) {
		let token = board[i],
			x = i % BOARD_DIM,
			y = Math.floor(i / BOARD_DIM)
		let space = $(`#${x}_${y}`)
			.off("click")
			.removeClass("movePossible empty tkB tkW")
		if (token == null) {
			space.text("■")
				.addClass("empty")
		} else {
			space.text("●")
				.addClass(token == "B" ? "tkB" : "tkW")
		}
	}
}

// update the #gameInfo section with values from
// the given game object (as retrieved from a GET 
// request to ENDPOINT)
function updateInfo(game) {
	let p1Name = game.p1.name
	let p2Name = game.p2.name
	if (game.abandoned) {
		if (p1Name == null) {
			p1Name = "[ABANDONED]"
		} else {
			p2Name = "[ABANDONED]"
		}
	} else if (game.hasCPU) {
		if (p1Name == null) {
			p1Name = "[GUEST]"
		}
		if (p2Name == null) {
			p2Name = "[CPU]"
		}
	} else if (p2Name == null) {
		p2Name = "[GUEST]"
	}
	$("#p1Name").text(p1Name)
	$("#p2Name").text(p2Name)
	$("#p1Score").text(game.p1.score)
	$("#p2Score").text(game.p2.score)
}

// Event handler for submitting a move to the server.
// All click events on td elements of #board with the
// class "movePossible" will be disabled, and that class
// will be stripped from them. If the server responds with
// success or a 409, then pollServer() will be called.
// Otherwise, a descriptive error message will be shown to
// the user. In the case of a 404 or 403 response, the page
// will be redirected to /home.html or /index.html?unauthorized
// respectively. In the case of a 409 response, pollServer() will
// be called. For all other non-success responses, the td elements
// mentioned earlier will be restored to how they were prior to the
// function call. The x and y values of the move to be submitted are
// retrieved from $(this).data()
async function submitMove() {
	// there can only be one submission:
	let clickableCells = $("#board td.movePossible")
		.removeClass("movePossible")
		.off("click")

	let { x, y } = $(this).data()
	try {
		await $.post({
			url: ENDPOINT,
			data: { x, y },
		})
		// if successfull, begin polling
		pollServer()
	} catch (err) {
		console.error(err)
		if (err.status == 404) {
			alert("The game has expired due to inactivity.")
			window.location.href = "/home.html"
		} else if (err.status == 403) {
			alert("Your login session has expired. Please login again")
			window.location.href = "/index.html?unauthorized"
		} else if (err.status == 409) {
			console.log(err.responseText)
			pollServer()
		} else {
			console.error(err)
			alert(`Problem submitting your move (${x}, ${y})`)

			clickableCells
				.addClass("movePossible")
				.click(function() { submitMove.call(this) })
		}
	}
}

// adds event handlers for submitting a move to all
// the elements indicated by possibleMoves, an array
// of object with x and y properties. The elements
// with an id of "X_Y", where X and Y are the x and y
// properties from that array, will gain the class
// "movePossible", and a click event that calls submitMove()
// with a `this` refering to the clicked element.
function waitforUserMove(possibleMoves) {
	for (let {x, y} of possibleMoves) {
		$(`#${x}_${y}`)
			.addClass("movePossible")
			.click(function() { submitMove.call(this) })
	}
}

// start polling the server for game state
// If the server responds successfully, then the retrieved
// game data will be used with updateInfo() and fillBoard()
// If it is the user's turn, then waitForUserMove() will be
// called. If the game was abandoned or has ended, then
// a descriptive message will be shown and polling ceases.
// Otherwise, if the game is still playable and it is not
// the user's turn, this function will be scheduled to run
// again in POLL_INTERVAL miliseconds.
// In the case of 404 or 403 response, the page will be
// redirected to /home.html or /index.html?unauthorized
// respectively. 
async function pollServer() {
	function continuePolling() {
		setTimeout(pollServer, POLL_INTERVAL)
	}

	let game;
	try {
		game = await $.get(ENDPOINT)
	} catch (err) {
		if (err.status == 404) {
			alert(
				"Game not found! Your game id may be incorrect,"
				+ " or if you are a guest, the game may have expired due to inactivity"
			)
			window.location.href = "/home.html"
		} else if (err.status == 403) {
			alert(
				"You are unauthorized to see this game."
				+ " (Your login session may have expired)"
			)
			window.location.href = "/index.html?unauthorized"
		} else {
			alert("unknown error!")
			console.error(err)
			continuePolling()
		}
		return
	}
	updateInfo(game)
	fillBoard(game.board)
	if (game.abandoned) {
		alert("Game was abandoned by the other player!")
	} else if (game.curTurn == 0) {
		alert("Game is over!")
	} else if (game.curTurn == game.pNum) {
		waitforUserMove(game.possibleMoves)
	} else {
		continuePolling()
	}
}

// gets run once DOM is safe to manipulate
// if there is no gid query parameter,
// redirects to /home.html. Otherwise
// constructs the board and begins polling
// for game data
async function main() {
	if (!GID) {
		alert("no game id!")
		window.location.href = "/home.html"
	} else {
		constructBoard()
		pollServer()
	}
}

// ensure that this script gets run again when
// the user goes back or forward in their history
window.onunload = _ => {}

$(main)