//this is a generic loader for Image objects
//e.g. with HTML or 2D Canvas
function ImageLoader(name, path) {
	path = path || name;
	var img = new Image();

	return {
		
		value: img,

		load: function(onComplete, onError) {
			img.onload = function() {
				img.onerror = img.onabort = null; //clear other listeners
				onComplete();
			};
			img.onerror = function() {
				img.onload = img.onabort = null;
				console.warn("Error loading image: "+path);
				onError();
			};
			img.onabort = function() {
				img.onload = img.onerror = null;
				console.warn("Aborted image: "+path);
				onError();
			};
			//setup source
			
			img.src = path;
		}
	};
}

ImageLoader.extensions = ["png", "gif", "jpg", "jpeg"];

ImageLoader.mediaType = "image";

module.exports = ImageLoader;