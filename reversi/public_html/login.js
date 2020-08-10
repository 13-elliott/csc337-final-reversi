/* Kitty Elliott
 * CSC 337
 * Final: Reversi
 * 	script for login page of Reversi app
 */

 // event handler for submitting the login
 // or registration form via AJAX. Must be
 // called such that `this` refers to the
 // form which triggered the event.
 // If the server responds with an error code,
 // the response text is appended to #notifArea
 // a paragraph html element.
 // If the server responds with a success code,
 // the user is redirected to /home.html
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

// returns true if there is an "unauthorized"
// key among the query parameters
function unauthorizedKeyPresent() {
	return window.location.search
		.substring(1)
		.split("&")
		.includes("unauthorized");
}

// gets run once the DOM is safe to manipulate
// If the user is logged in, they will be redirected to "/home.html"
// If there is an "unauthorized" key in the query parameters, adds a message
// to #notifArea.
// attaches the following event handlers:
// 	- all forms' submission events to formSubmitHandler
// 	- #notifArea's click event empties that element
// 	- #createGuestGame's click event attempts to create a guest game, and if
//		successful, redirects the user to the play page for that game
function main() {
	//
	$.get("/username")
		.done(_ => window.location.href = "/home.html")
	$("form").submit(formSubmitHandler);
	$("#notifArea").click(function() { $(this).empty() })
	$("#createGuestGame").click(e => 
		$.post({
			url: "/games",
			data: $.param({ cpu: 1 }),
			success: res => window.location.href = `/play.html?gid=${res}`,
			error: err => {
				console.error(err)
				alert("Encountered an error in setting up a guest game")
			}
		})
	)
	
	if (unauthorizedKeyPresent()) {
		$("<p/>")
			.text("Unauthorized! Your session may have expired")
			.appendTo("#notifArea");
	}
}

// ensure that this script gets run again when
// the user goes back or forward in their history
window.onunload = _ => {}

$(main);