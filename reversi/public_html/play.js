
function getGameId() {
    let kv_pairs = window.location.search
        .substring(1)
        .split("&")
        .map(
            sub => sub.split("=", 2)
                .map(decodeURIComponent)
        );
    console.log(kv_pairs)
    for (let [k, v] of kv_pairs)
        if (k == "gid")
            return v;
    return null;
}

function main() {
    let gid = getGameId();
    if (!gid) {
        alert("no game id!");
    }
}

$(main);