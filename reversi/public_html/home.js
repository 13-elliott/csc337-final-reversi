const POLL_INTERVAL = 2000;

function startPolling() {
	loadGamesList()
		.then(_=> setTimeout(startPolling, POLL_INTERVAL))
}

async function loadGamesList() {
	let games
	try {
		games = await $.get("/get/games")
		$("#gamesList").empty()
	} catch (err) {
		if (err.status == 403) {
			kickToLogin()
		} else {
			console.error(err)
		}
		return
	}
	if (games.length == 0) {
		$("#gamesList").text("No games found! Try creating one!")
	} else for (let g of games) {
		let p1Name = g.p1.name == null ? "[ABANDONED]" : g.p1.name
		let p2Name
		if (g.p2.name == null) {
			if (g.abandoned) {
				p2Name = "[ABANDONED]"
			} else if (g.hasCPU) {
				p2Name = "[CPU]"
			} else {
				p2Name = "[GUEST]"
			}
		} else {
			p2Name = g.p2.name
		}
		let turnString
		if (g.curTurn == 1) {
			turnString = p1Name
		} else if (g.curTurn == 2) {
			turnString = p2Name
		} else {
			turnString = "[Game Over]"
		}
		let lastAction = new Date(g.lastAction)
		
		$("<div/>").addClass("gameEntry")
			.append(
				$("<div/>") // scores
					.text(`${p1Name}: ${g.p1.score}, ${p2Name}: ${g.p2.score}`)
			)
			.append(
				$("<div/>")
					.text(`last move made at: ${lastAction.toUTCString()}`)
			)
			.append(
				$("<div/>")
					.text(`active player: ${turnString}`)
			)
			.append(
				$("<button/>")
					.text("Play")
					.click(e => window.location.href = `/play.html?gid=${g.id}`)
			)
			.append(
				$("<button/>")
					.text("Leave")
					.click(_ => $.ajax({
						url: `/games/id/${g.id}`,
						method: "DELETE",
						success: loadGamesList,
						fail: _ => alert("Encountered error leaving game!"),
					}))
			)
			.appendTo("#gamesList")
	}
}

function kickToLogin() {
	window.location.href = "/index.html?unauthorized"
}

function setP2NameDisplay() {
	let cpuValue = $("#cpuTrue").prop("checked")
	$("#p2Name").css("display", cpuValue ? "none" : "block")
}

function main() {
	// ensure that this script gets run again when the page is returned to
	window.onunload = _ => {}

	$.get("/get/username")
		.done(name => $(".username").text(name))
		.fail(kickToLogin)
	setP2NameDisplay()
	$("#createGame input[type=radio][name=cpu]")
		.change(setP2NameDisplay)
	$("#createGame").submit(function(e) {
		e.preventDefault();
		if ($("#cpuTrue").prop("checked")) {
			$("#p2Name").val("")
		} else {
			$("#p2Name").val((_, s) => s.trim())
		}
		$.post({
			url: "/games/create",
			data: $(this).serialize(),
			success: res => window.location.href = `/play.html?gid=${res}`,
			error: err => alert(err.responseText),
		})
	})
	startPolling()
}

$(main)