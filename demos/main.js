var AssetLoader = require("assetloader");

//By default, Image types are loaded.
var assets = new AssetLoader();

assets.loadStarted.add(function(ev) {
    console.log("LOAD STARTED", ev);
});

assets.loadFinished.add(function(ev) {
    console.log("LOAD FINISHED", ev);
});

assets.loadProgress.add(function(ev) {
    console.log("LOAD PROGRESS", ev);
});

assets.loadError.add(function(ev) {
    console.log("LOAD ERROR", ev);
})

var img = assets.add("img/scene.png");
var img2 = assets.add("img/grass.png");

function update() {
    requestAnimationFrame(update);

    if (assets.update()) {
        //Show your game...
    } else {
        //Game is loading.. show a preloader
    }
}

requestAnimationFrame(update);