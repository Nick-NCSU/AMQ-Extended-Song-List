// ==UserScript==
// @name         AMQ Extended Song Info Generator
// @namespace    https://github.com/Nick-NCSU
// @version      1.0
// @description  Generates a list of your anime and stores in the "extendedSongList" localstorage
// @author       Nick-NCSU
// @match        https://*.animemusicquiz.com/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// @downloadURL  https://github.com/Nick-NCSU/AMQ-Extended-Song-List/raw/main/src/generator.user.js
// @updateURL    https://github.com/Nick-NCSU/AMQ-Extended-Song-List/raw/main/src/generator.user.js
// ==/UserScript==

await setup();

async function setup() {
    let loadingScreen = document.getElementById("loadingScreen")
    if (document.getElementById("startPage") || loadingScreen == null || loadingScreen.className !== "gamePage hidden") {
        setTimeout(setup, 3000);
        return;
    }

    const songList = await loadSongList();

    const listener = new Listener("get song extended info", (payload) => {
	    if(songList[payload.annSongId]) {
            songList[payload.annSongId] = {
                ...songList[payload.annSongId],
                globalPercent: payload.globalPercent,
                recentPercent: payload.recentPercent,
                totalCorrectCount: payload.totalCorrectCount,
                totalWrongCount: payload.totalWrongCount,
                fileName: payload.fileName,
            }
            localStorage.setItem("extendedSongList", JSON.stringify(songList));
        }
    });
    listener.bindListener();

    let loadCount = 0;
    for(const song of Object.values(songList)) {
        if(!song.fileName) {
            socket.sendCommand({
                type: "library",
                command: "get song extended info",
                data: {
                    annSongId: song.annSongId,
                    includeFileNames: false,
                }
            });
            await sleep(2_000);
            console.log(`Loaded ${loadCount + 1}/${Object.keys(songList).length}`);
        }
        loadCount++;
    }
    console.log("Finished loading all songs");
}

async function loadSongList() {
    console.log("Loading song list");

    await new Promise((res) => expandLibrary.library.setup(res));

    let filter = expandLibrary.library.filterApplier.currentFilter;
    filter.watchedStatus.unwatched = false;
    expandLibrary.library.filterApplier.applyBaseFilter(filter);
    const amqList = expandLibrary.library.filterApplier.filteredEntries.map(anime => anime.animeEntry);

    const songList = JSON.parse(localStorage.getItem("extendedSongList") ?? "{}");
    for(const anime of amqList) {
        const songs = [...anime.songs.OP, ...anime.songs.ED, ...anime.songs.INS];
        for(const song of songs) {
            const entry = song.songEntry;
            songList[song.annSongId] = {
                ...songList[song.annSongId],
                annSongId: song.annSongId,
                amqSongId: entry.songId,
                artist: entry.artist.name,
                name: entry.name,
                rebroadcast: entry.rebroadcast,
                dub: entry.dub,
                anime: {
                    ...songList[song.annSongId]?.anime,
                    [anime.annId]: {
                        annId: anime.annId,
                        category: anime.category,
                        names: anime.mainNames,
                    }
                }
            };
        }
    }

    localStorage.setItem("extendedSongList", JSON.stringify(songList));
    return songList;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
