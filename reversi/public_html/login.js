/* Kitty Elliott
 * CSC 337
 * Final: Reversi
 * 	script for login page of Reversi app
 */

function formSubmitHandler(event) {
	event.preventDefault();
	$.post({
		url: this.action,
		data: $(this).serialize(),
		error: e => $("<p/>")
			.text(e.responseText)
			.appendTo("#notifArea"),
		success: _ => window.location.href = "/home.html",
	});
}

function unauthorizedKeyPresent() {
	return window.location.search
		.substring(1)
		.split("&")
		.includes("unauthorized");
}

function main() {
	$("form").submit(formSubmitHandler);
	$("#notifArea").click(function() { $(this).empty() })
	
	if (unauthorizedKeyPresent()) {
		$("<p/>")
			.text("Unauthorized! Your session may have expired")
			.appendTo("#notifArea");
	}
}

$(main);