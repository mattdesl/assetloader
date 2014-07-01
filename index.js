var Class = require('klasse');
var Signal = require('signals');
var ImageLoader = require('./ext/ImageLoader');

function registerLoader(loaders, loaderFunc, extensions, mediaType) {
	if (!loaderFunc || !extensions || !extensions.length)
		throw "must specify at least one extension for the loader";
	
	for (var i=0; i<extensions.length; i++) {
		loaders[ extensions[i] ] = loaderFunc;
		if (mediaType) 
			loaders[ mediaType + '/' + extensions[i] ] = loaderFunc;
	}
}

/**
 * This is a base class for asset management; ideal for either
 * generic HTML5 2D canvas or WebGL canvas.
 * 
 * @class  AssetLoader
 * @constructor 
 */
var AssetLoader = new Class({
	
	/**
	 * A read-only property that describes the number of 
	 * assets remaining to be loaded.
	 *
	 * @property remaining
	 * @type {Number}
	 * @readOnly
	 */
	remaining: {
		get: function() {
			return this.__loadCount;
		}
	},

	/**
	 * A read-only property that descriibes the total
	 * number of assets in this AssetLoader.
	 * 
	 * @property total
	 * @readOnly
	 * @type {Number}
	 */
	total: {
		get: function() {
			return this.__totalItems;
		}
	},

	/**
	 * A convenience read-only getter for the current progress,
	 * which is the same as total - remaining.
	 * 
	 * @property current
	 * @readOnly
	 * @type {Number}
	 */
	current: {
		get: function() {
			return this.total - this.remaining;
		}
	},

	//Constructor
	initialize: function AssetLoader() {

		/**
		 * An array of Descriptors that this queue is handling.
		 * This should not be modified directly.
		 * 
		 * @property assets
		 * @type {Array}
		 */
		this.assets = [];

		/**
		 * The queue of tasks to load. Each contains
		 * an
		 * {{#crossLink "AssetLoader.Descriptor"}}{{/crossLink}}.
		 *
		 * Loading a task will pop it off this list and fire the async
		 * or synchronous process.
		 *
		 * This should not be modified directly.
		 *
		 * @property tasks
		 * @protected
		 * @type {Array}
		 */
		this.tasks = [];

		//Private stuff... do not touch!

		this.__loadCount = 0;
		this.__totalItems = 0;

		// Signals 
		
		/**
		 * A signal dispatched when loading first begins, 
		 * i.e. when update() is called and the loading queue is the
		 * same size as the total asset list.
		 *
		 * @event loadStarted
		 * @type {Signal}
		 */
		this.loadStarted = new Signal();

		/**
		 * A signal dispatched when all assets have been loaded
		 * (i.e. their async tasks finished).
		 *
		 * @event loadFinished
		 * @type {Signal}
		 */
		this.loadFinished = new Signal();

		/**
		 * A signal dispatched on progress updates, once an asset
		 * has been loaded in full (i.e. its async task finished).
		 *
		 * This passes an event object to the listener function
		 * with the following properties:
		 * 
		 * - `current` number of assets that have been loaded
		 * - `total` number of assets to loaded
		 * - `name` of the asset which was just loaded
		 *  
		 * @event loadProgress
		 * @type {[type]}
		 */
		this.loadProgress = new Signal();

		/**
		 * A signal dispatched on problematic load; e.g. if
		 * the image was not found and "onerror" was triggered. 
		 * The first argument passed to the listener will be 
		 * the string name of the asset.
		 *
		 * The asset manager will continue loading subsequent assets.
		 *
		 * This is dispatched after the status of the asset is
		 * set to Status.LOAD_FAIL, and before the loadProgress
		 * signal is dispatched.
		 *
		 * @event loadError
		 * @type {Signal}
		 */
		this.loadError = new Signal();


		/**
		 * A set of loader plugins for this asset manager. These might be as simple
		 * as pushing HTML Image objects into a Texture, or more complex like decoding
		 * a compressed, mip-mapped, or cube-map texture.
		 *
		 * This object is a simple hashmap of lower-case extension names to Loader functions,
		 * and mime-types like "image/png" for data URIs.
		 * 
		 * @property loaders
		 * @type {Object}
		 */
		this.loaders = {};

		//copy from our common loaders
		for (var k in AssetLoader.commonLoaders) {
			if (AssetLoader.commonLoaders.hasOwnProperty(k)) {
				this.loaders[k] = AssetLoader.commonLoaders[k];
			}
		}

		//We register the image loader by default
		this.registerLoader(ImageLoader);
	},

	/**
	 * Destroys this asset manager; deleting the tasks
	 * and assets arrays and resetting the load count.
	 * 
	 * @method  destroy
	 */
	destroy: function() {
		this.removeAll();
	},

	/**
	 * Called to invalidate the asset manager
	 * and require all assets to be re-loaded.
	 * For example, a WebGL app will call this internally
	 * on context loss.
	 *
	 * @protected
	 * @method invalidate
	 */
	invalidate: function() {
		//mark all as not yet loaded
		for (var i=0; i<this.assets.length; i++) {
			this.assets[i].status = AssetLoader.Status.QUEUED;
		}
		
		//copy our assets to a queue which can be popped
		this.tasks = this.assets.slice();

		this.__loadCount = this.__totalItems = this.tasks.length;
	},

	/**
	 * Attempts to extract a mime-type from the given data URI. It will
	 * default to "text/plain" if the string is a data URI with no specified
	 * mime-type. If the string does not begin with "data:", this method 
	 * returns null.
	 *
	 * @method  __getDataType
	 * @private
	 * @param  {String} str the data URI
	 * @return {String}     the mime type
	 */
	__getDataType: function(str) {
		var test = "data:";
		//starts with 'data:'
		var start = str.slice(0, test.length).toLowerCase();
		if (start == test) {
			var data = str.slice(test.length);
			
			var sepIdx = data.indexOf(',');
			if (sepIdx === -1) //malformed data URI scheme
				return null;

			//e.g. "image/gif;base64" => "image/gif"
			var info = data.slice(0, sepIdx).split(';')[0];

			//We might need to handle some special cases here...
			//standardize text/plain to "txt" file extension
			if (!info || info.toLowerCase() == "text/plain")
				return "txt"

			//User specified mime type, try splitting it by '/'
			return info.split('/').pop().toLowerCase();
		}
		return null;
	},

	__extension: function(str) {
		var idx = str.lastIndexOf('.');
		if (idx === -1 || idx === 0 || idx === str.length-1) // does not have a clear file extension
			return "";
		return str.substring(idx+1).toLowerCase();
	},

	/**
	 * Returns the AssetDescriptor by name, or null if not found.
	 * 
	 * @method  getDescriptor
	 * @protected
	 * @param  {AssetDescriptor} name the name of the asset
	 * @return {any}      the asset
	 */
	getDescriptor: function(name) {
		var idx = this.indexOf(this.assets, name);
		return idx !== -1 ? this.assets[idx] : null;
	},

	getStatus: function(name) {
		var d = this.getDescriptor(name);
		return d ? d.status : null;
	},
	
	isLoaded: function(name) {
		return this.getStatus(name) === AssetLoader.Status.LOAD_SUCCESS;
	},
	
	/**
	 * Returns the value stored for this asset, such as an Image
	 * if we are using a Canvas image loading plugin. Returns null
	 * if the asset was not found.
	 * 	
	 * @param  {String} name the name of the asset to get
	 * @return {any}    the asset by name
	 */
	get: function(name) {
		var d = this.getDescriptor(name);
		return d ? d.value : null;
	},

	/**
	 * Removes a reference to the given asset, and returns the removed
	 * asset. If the asset by name was not found, null is returned.
	 *
	 * This will also remove the asset from the task list.
	 *
	 * Note that this will not destroy any resources that asset maintained;
	 * so it is the user's duty to do so after removing it from the queue.
	 * 
	 * @param  {[type]} name [description]
	 * @return {[type]}      [description]
	 */
	remove: function(name) {
		var assetIdx = this.indexOf(this.assets, name);
		if (assetIdx === -1)
			return null;

		var asset = this.assets[assetIdx];
		var status = asset.status;

		//let's see.. the asset can either be QUEUED
		//or LOADING, or LOADED (fail/success). if it's queued 

		
		//remove reference to the asset
		this.assets.splice(assetIdx, 1);
		
		//make sure it's not in our task list
		var taskIdx = this.indexOf(this.tasks, name);

		this.__totalItems = Math.max(0, this.__totalItems-1);
		this.__loadCount = Math.max(0, this.__loadCount-1);
		if (taskIdx !== -1) {
			//it's waiting to be loaded... we need to remove it
			//and also decrement the load / total count
			this.tasks.splice(taskIdx, 1);
		} else {
			//not in tasks... already queued
			
		}

		if (this.__loadCount === 0) {
			if (this.loading) {
				this.loadFinished.dispatch({
					current: 0,
					total: 0
				});
			}
			this.loading = false;
		}
		return asset.value;
	},

	removeAll: function() {
		this.assets.length = 0;
		this.tasks.length = 0;
		this.__loadCount = this.__totalItems = 0;

		if (this.loading) {
			this.loadFinished.dispatch({
				current: 0,
				total: 0
			});
		}
		this.loading = false;
	},

	/**
	 * Calls `add()` for each string in the given array.
	 *
	 * @method addAll
	 * @param  {Array} array 
	 */
	addAll: function(array) {
		var ret = new Array(array.length);
		for (var i=0; i<array.length; i++) {
			ret[i] = this.add(array[i]);
		}
		return ret;
	},

	/**
	 * Pushes an asset onto this stack. This
	 * attempts to detect the loader for you based
	 * on the asset name's file extension (or data URI scheme). 
	 * If the asset name doesn't have a known file extension,
	 * or if there is no loader registered for that filename,
	 * this method throws an error. If you're trying to use 
	 * generic keys for asset names, use the addAs method and
	 * specify a loader plugin.
	 * 
	 * This method's arguments are passed to the constructor
	 * of the loader function. 
	 *
	 * The return value of this method is determined by
	 * the loader's processArguments method. For example, the
	 * default Image loader returns a Texture object.
	 *
	 * @example
	 *    //uses ImageLoader to get a new Texture
	 *    var tex = assets.add("tex0.png"); 
	 *
	 *    //or you can specify your own texture
	 *    assets.add("tex1.png", tex1);
	 *
	 *    //the ImageLoader also accepts a path override, 
	 *    //but the asset key is still "frames0.png"
	 *    assets.add("frame0.png", tex1, "path/to/frame1.png");
	 *    
	 * @method  add
	 * @param  {String} name the asset name
	 * @param  {any} args a variable number of optional arguments
	 * @return {any} returns the best type for this asset's loader
	 */
	add: function(name) {
		if (!name)
			throw "No asset name specified for add()";

		var ext = this.__getDataType(name);
		if (ext === null)
			ext = this.__extension(name);

		if (!ext) 
			throw "Asset name does not have a file extension: " + name;
		if (!this.loaders.hasOwnProperty(ext))
			throw "No known loader for extension "+ext+" in asset "+name;

		var args = [ this.loaders[ext], name ];
		args = args.concat( Array.prototype.slice.call(arguments, 1) );

		return this.addAs.apply(this, args);
	},

	/**
	 * Pushes an asset onto this stack. This allows you to
	 * specify a loader function for the asset. This is useful
	 * if you wish to use generic names for your assets (instead of
	 * filenames), or if you want a particular asset to use a specific
	 * loader. 
	 *
	 * The first argument is the loader function, and the second is the asset
	 * name. Like with {{#crossLink "AssetLoader/load:method"}}{{/crossLink}}, 
	 * any subsequent arguments will be passed along to the loader.
	 *
	 * The return value of this method is determined by
	 * the loader's return value, if it has one. For example, a Canvas ImageLoader
	 * plugin might returnn Image object. This is also the value which can be retrieved with
	 * `get()` or by accessing the `value` of an AssetDescriptor. If the loader function
	 * does not implement a return value, `undefined` is returned. 
	 *
	 * @method  addAs
	 * @param {Fucntion} loader the loader function
	 * @param {String} name the asset name
	 * @param {Object ...} args a variable number of optional arguments
	 * @return {any} returns the best type for this asset's loader
	 */
	addAs: function(loader, name) {
		if (!name)
			throw "no name specified to load";
		if (!loader)
			throw "no loader specified for asset "+name;

		var idx = this.indexOf(this.assets, name);
		if (idx !== -1) //TODO: eventually add support for dependencies and shared assets
			throw "asset already defined in asset manager";

		//grab the arguments, except for the loader function.
		var args = Array.prototype.slice.call(arguments, 1);
		
		//create our loader function and get the new return value
		var retObj = loader.apply(this, args);

		if (typeof retObj.load !== "function")
			throw "loader not implemented correctly; must return a 'load' function";

		//keep hold of this asset and its original name
		var descriptor = new AssetLoader.Descriptor(name, retObj.load, retObj.value);
		this.assets.push( descriptor );

		//also add it to our queue of current tasks
		this.tasks.push( descriptor );
		this.__loadCount++;
		this.__totalItems++;

		return retObj.value;
	},

	indexOf: function(list, name) {
		for (var i=0; i<list.length; i++) {
			if (list[i] && list[i].name === name)
				return i;
		}
		return -1;
	},


	__loadCallback: function(name, success) {
		//if 'false' was passed, use it.
		//otherwise treat as 'true'
		success = success !== false;

		var assetIdx = this.indexOf(this.assets, name);
				
		//If the asset is not found, we can assume it
		//was removed from the queue. in this case we 
		//want to ignore events since they should already
		//have been fired.
		if (assetIdx === -1) {
			return;
		}
		
		this.__loadCount--;

		this.assets[assetIdx].status = success 
						? AssetLoader.Status.LOAD_SUCCESS
						: AssetLoader.Status.LOAD_FAILED;

		var current = (this.__totalItems - this.__loadCount),
			total = this.__totalItems;

		if (!success) {
			this.loadError.dispatch({
				name: name,
				current: current,
				total: total
			});
		}

		this.loadProgress.dispatch({
			name: name,
			current: current,
			total: total
		});
			
		if (this.__loadCount === 0) {
			this.loading = false;
			this.loadFinished.dispatch({
				current: current,
				total: total
			});
		}
	},

	/**
	 * Updates this AssetLoader by loading the next asset in the queue.
	 * If all assets have been loaded, this method returns true, otherwise
	 * it will return false.
	 *
	 * @method  update
	 * @return {Boolean} whether this asset manager has finished loading
	 */
	update: function() {
		if (this.tasks.length === 0)
			return (this.__loadCount === 0);

		//If we still haven't popped any from the assets list...
		if (this.tasks.length === this.assets.length) {
			this.loading = true;
			this.loadStarted.dispatch({
				current: 0,
				total: this.__totalItems
			});
		}

		//grab the next task on the stack
		var nextTask = this.tasks.shift();

		//apply the loading step
		var loader = nextTask.loadFunc;

		var cb = this.__loadCallback.bind(this, nextTask.name, true);
		var cbFail = this.__loadCallback.bind(this, nextTask.name, false);

		//do the async load ...
		loader.call(this, cb, cbFail);

		return (this.__loadCount === 0);
	},

	/**
	 * Registers a loader function for this queue with the given extension(s).
	 * This will override any extensions or mime-types already registered.
	 * 
	 * @method registerLoader
	 * @param {Function} loader the loader function
	 */
	registerLoader: function(loader) {
		registerLoader(this.loaders, loader, loader.extensions, loader.mediaType);
	},

	/**
	 * Starts the async loader. This method doesn't require polling update()
	 * every frame. It will run through all the tasks and 
	 * 
	 * @return {[type]} [description]
	 */
	load: function() {
		while (this.tasks.length > 0) {
			this.update();
		}
	},
});
	
/**
 * This is a map of "common" loaders, shared by many contexts.
 * For example, an image loader is specific to WebGL, Canvas, SVG, etc,
 * but a JSON loader might be renderer-independent and thus "common". 
 *
 * When a new AssetManager is created, it will use these loaders.
 * 
 * @type {Object}
 */
AssetLoader.commonLoaders = {};

/**
 * Registers a "common" loader function with the given extension(s).
 * 
 * For example, an image loader is specific to WebGL, Canvas, SVG, etc,
 * but a JSON loader might be renderer-independent and thus "common". 
 *
 * When a new AssetManager is created, it will use these loaders.
 * 
 * @method registerCommonLoader
 * @param {Function} loader the loader function
 */
AssetLoader.registerCommonLoader = function(loader) {
	registerLoader(AssetLoader.commonLoaders, loader, loader.extensions, loader.mediaType);
}

/**
 * A simple wrapper for assets which will be passed along to the loader;
 * this is used internally.
 * 
 * //@class AssetLoader.Descriptor
 */
AssetLoader.Descriptor = function(name, loadFunc, value) {
	this.name = name;
	this.loadFunc = loadFunc;
	this.value = value;
	this.status = AssetLoader.Status.QUEUED;
};

/**
 * Defines the status of an asset in the manager queue.
 * The constants under this object are one of:
 * 
 *     QUEUED
 *     LOADING
 *     LOAD_SUCCESS
 *     LOAD_FAIL
 * 
 * @attribute  Status
 * @type {Object}
 */
AssetLoader.Status = {
	QUEUED: "QUEUED",
	LOADING: "LOADING",
	LOAD_SUCCESS: "LOAD_SUCCESS",
	LOAD_FAIL: "LOAD_FAIL"
};

module.exports = AssetLoader;
