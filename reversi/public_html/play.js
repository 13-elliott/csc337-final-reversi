const BOARD_DIM = 8
const POLL_INTERVAL = 1000
const GID = getGameId()
const ENDPOINT = `/games/id/${GID}`

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
	return null
}

function constructBoard() {
	let table = $("#board")
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

function fillBoard(board) {
	let table = $("#board")
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

// `this` refers to the DOM element that was clicked
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
			window.location.href = "/index.html"
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

function waitforUserMove(possibleMoves) {
	for (let {x, y} of possibleMoves) {
		$(`#${x}_${y}`)
			.addClass("movePossible")
			.click(function() { submitMove.call(this) })
	}
}

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
			window.location.href = "/index.html"
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

async function main() {
	if (!GID) {
		alert("no game id!")
	} else {
		constructBoard()
		pollServer()
	}
}

$(main)