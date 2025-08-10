// ==UserScript==
// @name         AMQ Extended Song Info Generator
// @namespace    https://github.com/Nick-NCSU
// @version      1.4.2
// @description  Generates a list of your anime and stores in the "extendedSongList" localstorage
// @author       Nick-NCSU
// @match        https://*.animemusicquiz.com/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// @require      https://github.com/joske2865/AMQ-Scripts/raw/master/common/amqScriptInfo.js
// @downloadURL  https://github.com/Nick-NCSU/AMQ-Extended-Song-List/raw/refs/heads/main/generator.user.js
// @updateURL    https://github.com/Nick-NCSU/AMQ-Extended-Song-List/raw/refs/heads/main/generator.user.js
// ==/UserScript==

let songList = JSON.parse(localStorage.getItem("extendedSongList") ?? "{}");
let extendedDataPID = 0;
await setup();

async function setup() {
    let loadingScreen = document.getElementById("loadingScreen")
    if (document.getElementById("startPage") || loadingScreen == null || loadingScreen.className !== "gamePage hidden") {
        setTimeout(setup, 3000);
        return;
    }

    setupScriptData();

    await loadSongList();

    setupListeners();

    await loadExtendedData(++extendedDataPID);
}

function setupScriptData() {
    AMQ_addScriptData({
        name: "Extended Song Info Generator",
        author: "Nick-NCSU",
        version: "1.4.2",
        link: "https://github.com/Nick-NCSU/AMQ-Extended-Song-List/raw/refs/heads/main/generator.user.js",
        description: `
            <p>Collects extended data from your list of anime.</p>
            <p id="extended-song-info-progress">Progress 0/0</p>
            <a id="extended-song-info-download">Download</a> —
            <a id="extended-song-info-prune">Remove Deleted</a> —
            <a id="extended-song-info-reset">Reset</a>
        `
    });

    const downloadButton = document.getElementById('extended-song-info-download');
    downloadButton.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(songList, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'extendedSongList.json';
        link.click();
    });

    const pruneButton = document.getElementById('extended-song-info-prune');
    pruneButton.addEventListener('click', async () => {
        extendedDataPID++;
        await sleep(2_000);
        await loadSongList(true);
        await loadExtendedData(extendedDataPID);
    });

    const resetButton = document.getElementById('extended-song-info-reset');
    resetButton.addEventListener('click', async () => {
        extendedDataPID++;
        await sleep(2_000);
        songList = {};
        await loadSongList();
        await loadExtendedData(extendedDataPID);
    });
}

async function loadSongList(deleteMissing = false) {
    console.log("Loading song list");

    await new Promise((res) => expandLibrary.library.setup(res));

    let filter = expandLibrary.library.filterApplier.currentFilter;
    filter.watchedStatus.unwatched = false;
    expandLibrary.library.filterApplier.applyBaseFilter(filter);
    const amqList = expandLibrary.library.filterApplier.filteredEntries.map(anime => anime.animeEntry);

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
                type: song.type,
                number: song.number,
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

    if(deleteMissing) {
        console.log("Deleting missing values from list");
        const validSongs = new Set(amqList.flatMap(anime => [...anime.songs.OP, ...anime.songs.ED, ...anime.songs.INS]).map(song => song.annSongId));
        for(const key in songList) {
            if(!validSongs.has(+key)) {
                console.log(`Deleting song ${key}`);
                delete songList[key];
            }
        }
    }

    localStorage.setItem("extendedSongList", JSON.stringify(songList));
    return songList;
}

function setupListeners() {
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

    const listener2 = new Listener("answer results", (payload) => {
        if(quiz.isSpectator) return;

        const matchingSong = Object.values(songList).find(song => {
            return song.name === payload.songInfo.songName
                && Object.keys(song.anime).some(id => +id === payload.songInfo.annId)
                && song.artist === payload.songInfo.artistInfo.name;
        });

        if(!matchingSong) return;

        let isCorrect;
        if (quiz.gameMode === "Nexus") {
            isCorrect = payload.players[0]?.correct;
        } else {
            isCorrect = payload.players.find(player => player.gamePlayerId === quiz.ownGamePlayerId)?.correct;
        }

        isCorrect ? matchingSong.totalCorrectCount++ : matchingSong.totalWrongCount++;
        matchingSong.globalPercent = Math.round(payload.songInfo.animeDifficulty);

        localStorage.setItem("extendedSongList", JSON.stringify(songList));
    });
    listener2.bindListener();
}

async function loadExtendedData(PID) {
    const progressText = document.getElementById('extended-song-info-progress');
    const totalSongs = Object.keys(songList).length;
    let loadCount = 0;
    for(const song of Object.values(songList)) {
        if(extendedDataPID !== PID) {
            console.log("Restarting loading data");
            return;
        }
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
            console.log(`Loaded ${loadCount + 1}/${totalSongs}`);
        }
        loadCount++;
        progressText.textContent = `Progress ${loadCount}/${totalSongs}`;
    }
    console.log("Finished loading all songs");
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
