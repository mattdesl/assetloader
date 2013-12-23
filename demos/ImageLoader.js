//this is a generic loader for Image objects
//e.g. with HTML or 2D Canvas
function ImageLoader(name, path) {
	path = path || name;
	var img = new Image();

	return {
		
		value: img,

		load: function(finished) {
			img.onload = function() {
				img.onerror = img.onabort = null; //clear other listeners
				finished();
			};
			img.onerror = function() {
				img.onload = img.onabort = null;
				console.warn("Error loading image: "+path);
				finished(false);
			};
			img.onabort = function() {
				img.onload = img.onerror = null;
				console.warn("Aborted image: "+path);
				finished(false);
			};
			//setup source
			
			img.src = path;
		}
	};
}

ImageLoader.extensions = ["png", "gif", "jpg", "jpeg"];

ImageLoader.mediaType = "image";

module.exports = ImageLoader;