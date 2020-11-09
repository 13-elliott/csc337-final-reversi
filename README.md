# csc337-final-reversi
NodeJS and MongoDB based web app for playing "Reversi" against other users, guests, or a computer player.
Done as the self-directed final project for "Web Development" course in Spring 2020

[Video Demonstration](https://www.youtube.com/watch?v=MScDTXZkoD4 "Video Demonstration")

Reversi, also called Othello, is a game that takes place on a grid in which players, represented by white
or black tokens, attempt to “capture” the other player’s tokens by surrounding them in some linear form,
thereby flipping the other player’s captured tokens to be the capturing player’s own color. The game is over
when no more moves can be made, and the winner is the player with the most tokens on the board.

## Technical Details
### Frontend
The frontend includes a screen for account creation or login. The home page of a logged-in user displays
options for creating a new game against another user, for creating a game against an AI player, and for
viewing one’s matches. The list of matches shows the status of each match (e.g. “waiting on other player”,
“ready to make move”, “won”, “lost”, “abandoned by other player”)  and the options to abandon said match.
A page for the game board submits moves via AJAX, and polls for the other player’s move when it is their turn.
The board is updated via AJAX when that move has been recieved. The user can only submit moves on their own
turn, otherwise the board will be “locked”. A summary of the current game state (which player’s turn it is or
win/lose/draw condition) is displayed alongside the current scores (number of white & black tokens).
### Backend
The node.js server handles the game logic, accepting moves and responding with the next game state. 

Routes include a login page, a home page, a statically-served game board page (with game id determined by url
query parameter), a route for matches generally (GET:  retreieve the user's active matches, POST: create a new
match) and a route for each individual match by id (GET: retrieve match state, POST: submit a move, DELETE: leave
the match).

Database consists of Account, Game, and Session scehemata, which are [defined here](reversi/db_models.js)
