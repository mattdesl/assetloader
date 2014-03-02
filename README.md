# AssetLoader

This is a simple preloading queue for images, ideal for canvas games with a render loop.

# example

```js
var AssetLoader = require("assetloader");

var assets = new AssetLoader();

//We can optionally listen for events like so:
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

//Here we add the assets to the loader.
//The returned type is defined by the "loader" which is
//picked from the file extension. By default, PNG, GIF, JPG, and JPEG use the
//ImageLoader, which returns an Image object. 

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
```

# kami-assets

This module is renderer-agnostic. But if you want something specific for kami, you should see `kami-assets`, which overrides AssetLoader and returns a `Texture` object instead of an Image.

# testing

To run the demos in this lib, you will need `beefy` and `browserify`. Then from this directory, run:

```
beefy main.js --cwd demos --live -- -r './index.js:assetloader'
```