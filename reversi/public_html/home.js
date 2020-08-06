
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

function main() {
	// ensure that this script gets run again when the page is returned to
	window.onunload = _ => {}

	$.get("/get/username")
		.done(name => $(".username").text(name))
		.fail(kickToLogin)
	let cpuRButtons = $("#createGame input[type=radio][name=cpu]").change(function(e) {
		$("#p2Name").prop("disabled", Boolean(this.value))
	})
	$("#createGame").submit(function(e) {
		if ($("#cpuTrue").prop("checked")) {
			$("#p2Name").val("")
		}
	})
	loadGamesList()
}

$(main)