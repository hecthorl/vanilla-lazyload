const runningOnBrowser = typeof window !== "undefined";

const isBot =
	(runningOnBrowser && !("onscroll" in window)) ||
	(typeof navigator !== "undefined" &&
		/(gle|ing|ro)bot|crawl|spider/i.test(navigator.userAgent));

const supportsIntersectionObserver =
	runningOnBrowser && "IntersectionObserver" in window;

const supportsClassList =
	runningOnBrowser && "classList" in document.createElement("p");

const defaultSettings = {
    elements_selector: "img",
    container: isBot || runningOnBrowser ? document : null,
    threshold: 300,
    thresholds: null,
    data_src: "src",
    data_srcset: "srcset",
    data_sizes: "sizes",
    data_bg: "bg",
    data_poster: "poster",
    class_loading: "loading",
    class_loaded: "loaded",
    class_error: "error",
    load_delay: 0,
    auto_unobserve: true,
    callback_enter: null,
    callback_exit: null,
    callback_loading: null,
    callback_loaded: null,
    callback_error: null,
    callback_finish: null,
    use_native: false
};

const getExtendedSettings = customSettings => {
    return Object.assign({}, defaultSettings, customSettings);
};

/* Creates instance and notifies it through the window element */
const createInstance = function(classObj, options) {
    var event;
    let eventString = "LazyLoad::Initialized";
    let instance = new classObj(options);
    try {
        // Works in modern browsers
        event = new CustomEvent(eventString, { detail: { instance } });
    } catch (err) {
        // Works in Internet Explorer (all versions)
        event = document.createEvent("CustomEvent");
        event.initCustomEvent(eventString, false, false, { instance });
    }
    window.dispatchEvent(event);
};

/* Auto initialization of one or more instances of lazyload, depending on the 
    options passed in (plain object or an array) */
const autoInitialize = (classObj, options) => {
    if (!options) {
        return;
    }
    if (!options.length) {
        // Plain object
        createInstance(classObj, options);
    } else {
        // Array of objects
        for (let i = 0, optionsItem; (optionsItem = options[i]); i += 1) {
            createInstance(classObj, optionsItem);
        }
    }
};

const statusObserved = "observed";
const statusLoading = "loading";
const statusLoaded = "loaded";
const statusError = "error";
const statusNative = "native";

const dataPrefix = "data-";
const statusDataName = "ll-status";
const timeoutDataName = "ll-timeout";

const getData = (element, attribute) => {
    return element.getAttribute(dataPrefix + attribute);
};

const setData = (element, attribute, value) => {
    var attrName = dataPrefix + attribute;
    if (value === null) {
        element.removeAttribute(attrName);
        return;
    }
    element.setAttribute(attrName, value);
};

const resetStatus = element => setData(element, statusDataName, null);

const setStatus = (element, status) => setData(element, statusDataName, status);

const hasAnyStatus = element => getData(element, statusDataName) !== null;

const hasStatusObserved = element => getData(element, statusDataName) === statusObserved;

const hasStatusError = element => getData(element, statusDataName) === statusError;

const setTimeoutData = (element, value) => setData(element, timeoutDataName, value);

const getTimeoutData = element => getData(element, timeoutDataName);

const increaseLoadingCount = instance => {
    if (!instance) return;
    instance.loadingCount += 1;
};

const getSourceTags = parentTag => {
    let sourceTags = [];
    for (let i = 0, childTag; (childTag = parentTag.children[i]); i += 1) {
        if (childTag.tagName === "SOURCE") {
            sourceTags.push(childTag);
        }
    }
    return sourceTags;
};

const setAttributeIfValue = (element, attrName, value) => {
    if (!value) {
        return;
    }
    element.setAttribute(attrName, value);
};

const setImageAttributes = (element, settings) => {
    setAttributeIfValue(element, "sizes", getData(element, settings.data_sizes));
    setAttributeIfValue(element, "srcset", getData(element, settings.data_srcset));
    setAttributeIfValue(element, "src", getData(element, settings.data_src));
};

const setSourcesImg = (element, settings) => {
    const parent = element.parentNode;

    if (parent && parent.tagName === "PICTURE") {
        let sourceTags = getSourceTags(parent);
        sourceTags.forEach(sourceTag => {
            setImageAttributes(sourceTag, settings);
        });
    }

    setImageAttributes(element, settings);
};

const setSourcesIframe = (element, settings) => {
    setAttributeIfValue(element, "src", getData(element, settings.data_src));
};

const setSourcesVideo = (element, settings) => {
    let sourceTags = getSourceTags(element);
    sourceTags.forEach(sourceTag => {
        setAttributeIfValue(sourceTag, "src", getData(sourceTag, settings.data_src));
    });
    setAttributeIfValue(element, "poster", getData(element, settings.data_poster));
    setAttributeIfValue(element, "src", getData(element, settings.data_src));
    element.load();
};

const setSourcesBgImage = (element, settings) => {
    const srcDataValue = getData(element, settings.data_src);
    const bgDataValue = getData(element, settings.data_bg);

    if (srcDataValue) {
        element.style.backgroundImage = `url("${srcDataValue}")`;
    }

    if (bgDataValue) {
        element.style.backgroundImage = bgDataValue;
    }
};

const setSourcesFunctions = {
    IMG: setSourcesImg,
    IFRAME: setSourcesIframe,
    VIDEO: setSourcesVideo
};

const setSources = (element, settings, instance) => {
    const tagName = element.tagName;
    const setSourcesFunction = setSourcesFunctions[tagName];
    if (setSourcesFunction) {
        setSourcesFunction(element, settings);
        increaseLoadingCount(instance);
    } else {
        setSourcesBgImage(element, settings);
    }
};

const addClass = (element, className) => {
	if (supportsClassList) {
		element.classList.add(className);
		return;
	}
	element.className += (element.className ? " " : "") + className;
};

const removeClass = (element, className) => {
	if (supportsClassList) {
		element.classList.remove(className);
		return;
	}
	element.className = element.className.
		replace(new RegExp("(^|\\s+)" + className + "(\\s+|$)"), " ").
		replace(/^\s+/, "").
		replace(/\s+$/, "");
};

const safeCallback = (callback, arg1, arg2, arg3) => {
	if (!callback) {
		return;
	}

	if (arg3 !== undefined) {
		callback(arg1, arg2, arg3);
		return;
	}
	if (arg2 !== undefined) {
		callback(arg1, arg2);
		return;
	}
	callback(arg1);
};

const genericLoadEventName = "load";
const mediaLoadEventName = "loadeddata";
const errorEventName = "error";

const decreaseLoadingCount = (settings, instance) => {
    if (!instance) return;
    instance.loadingCount -= 1;
    checkFinish(settings, instance);
};

const checkFinish = (settings, instance) => {
    if (instance.toLoadCount || instance.loadingCount) return;
    safeCallback(settings.callback_finish, instance);
};

const addEventListener = (element, eventName, handler) => {
    element.addEventListener(eventName, handler);
};

const removeEventListener = (element, eventName, handler) => {
    element.removeEventListener(eventName, handler);
};

const addEventListeners = (element, loadHandler, errorHandler) => {
    addEventListener(element, genericLoadEventName, loadHandler);
    addEventListener(element, mediaLoadEventName, loadHandler);
    addEventListener(element, errorEventName, errorHandler);
};

const removeEventListeners = (element, loadHandler, errorHandler) => {
    removeEventListener(element, genericLoadEventName, loadHandler);
    removeEventListener(element, mediaLoadEventName, loadHandler);
    removeEventListener(element, errorEventName, errorHandler);
};

const loadHandler = (event, settings, instance) => {
    const element = event.target;
    setStatus(element, statusLoaded);
    removeClass(element, settings.class_loading);
    addClass(element, settings.class_loaded);
    safeCallback(settings.callback_loaded, element, instance);
    decreaseLoadingCount(settings, instance);
};

const errorHandler = (event, settings, instance) => {
    const element = event.target;
    setStatus(element, statusError);
    removeClass(element, settings.class_loading);
    addClass(element, settings.class_error);
    safeCallback(settings.callback_error, element, instance);
    decreaseLoadingCount(settings, instance);
};

const addOneShotEventListeners = (element, settings, instance) => {
    const _loadHandler = event => {
        loadHandler(event, settings, instance);
        removeEventListeners(element, _loadHandler, _errorHandler);
    };
    const _errorHandler = event => {
        errorHandler(event, settings, instance);
        removeEventListeners(element, _loadHandler, _errorHandler);
    };
    addEventListeners(element, _loadHandler, _errorHandler);
};

const manageableTags = ["IMG", "IFRAME", "VIDEO"];

const decreaseToLoadCount = (settings, instance) => {
    if (!instance) return;
    instance.toLoadCount -= 1;
    checkFinish(settings, instance);
};

const unobserve = (element, instance) => {
    if (!instance) return;
    const observer = instance._observer;
    if (observer && instance._settings.auto_unobserve) {
        observer.unobserve(element);
    }
};

const isManageableTag = element => manageableTags.indexOf(element.tagName) > -1;

const enableLoading = (element, settings, instance) => {
    if (isManageableTag(element)) {
        addOneShotEventListeners(element, settings, instance);
        addClass(element, settings.class_loading);
    }
    setSources(element, settings, instance);
    decreaseToLoadCount(settings, instance);
};

const load = (element, settings, instance) => {
    enableLoading(element, settings, instance);
    setStatus(element, statusLoading);
    safeCallback(settings.callback_loading, element, instance);
    /* DEPRECATED, REMOVE IN V.15 => */ safeCallback(settings.callback_reveal, element, instance);
    unobserve(element, instance);
};

const loadNative = (element, settings, instance) => {
    enableLoading(element, settings, instance);
    setStatus(element, statusNative);
};

const cancelDelayLoad = element => {
    var timeoutId = getTimeoutData(element);
    if (!timeoutId) {
        return; // do nothing if timeout doesn't exist
    }
    clearTimeout(timeoutId);
    setTimeoutData(element, null);
};

const delayLoad = (element, settings, instance) => {
    const loadDelay = settings.load_delay;
    let timeoutId = getTimeoutData(element);
    if (timeoutId) {
        return; // do nothing if timeout already set
    }
    timeoutId = setTimeout(function() {
        load(element, settings, instance);
        cancelDelayLoad(element);
    }, loadDelay);
    setTimeoutData(element, timeoutId);
};

const onEnter = (element, entry, instance) => {
    const settings = instance._settings;
    safeCallback(settings.callback_enter, element, entry, instance);
    if (!settings.load_delay) {
        load(element, settings, instance);
        return;
    }
    delayLoad(element, settings, instance);
};

const onExit = (element, entry, instance) => {
    const settings = instance._settings;
    safeCallback(settings.callback_exit, element, entry, instance);
    if (!settings.load_delay) {
        return;
    }
    cancelDelayLoad(element);
};

const nativeLazyTags = ["IMG", "IFRAME"];
const loadingString = "loading";

const shouldUseNative = settings =>
    settings.use_native && loadingString in HTMLImageElement.prototype;

const loadAllNative = (elements, settings, instance) => {
    elements.forEach(element => {
        if (nativeLazyTags.indexOf(element.tagName) === -1) {
            return;
        }
        element.setAttribute(loadingString, "lazy");
        loadNative(element, settings, instance);
    });
    instance.toLoadCount = 0;
};

const isIntersecting = entry => entry.isIntersecting || entry.intersectionRatio > 0;

const getObserverSettings = settings => ({
    root: settings.container === document ? null : settings.container,
    rootMargin: settings.thresholds || settings.threshold + "px"
});

const resetObserver = observer => {
    observer.disconnect();
};

const observeElements = (observer, elements) => {
    elements.forEach(element => {
        observer.observe(element);
        setStatus(element, statusObserved);
    });
};

const updateObserver = (observer, elementsToObserve) => {
    resetObserver(observer);
    observeElements(observer, elementsToObserve);
};

const setObserver = instance => {
    if (!supportsIntersectionObserver || shouldUseNative(instance._settings)) {
        return;
    }
    instance._observer = new IntersectionObserver(entries => {
        entries.forEach(entry =>
            isIntersecting(entry)
                ? onEnter(entry.target, entry, instance)
                : onExit(entry.target, entry, instance)
        );
    }, getObserverSettings(instance._settings));
};

const toArray = nodeSet => Array.prototype.slice.call(nodeSet);

const queryElements = settings =>
    settings.container.querySelectorAll(settings.elements_selector);

const isToManage = element => !hasAnyStatus(element) || hasStatusObserved(element);
const excludeManagedElements = elements => toArray(elements).filter(isToManage);

const hasError = element => hasStatusError(element);
const filterErrorElements = elements => toArray(elements).filter(hasError);

const getElementsToLoad = (elements, settings) =>
    excludeManagedElements(elements || queryElements(settings));

const retryLazyLoad = instance => {
    const settings = instance._settings;
    const errorElements = filterErrorElements(queryElements(settings));
    errorElements.forEach(element => {
        removeClass(element, settings.class_error);
        resetStatus(element);
    });
    instance.update();
};

const setOnlineCheck = instance => {
    if (!runningOnBrowser) {
        return;
    }
    window.addEventListener("online", event => {
        retryLazyLoad(instance);
    });
};

const LazyLoad = function(customSettings, elements) {
    this._settings = getExtendedSettings(customSettings);
    this.loadingCount = 0;
    setObserver(this);
    setOnlineCheck(this);
    this.update(elements);
};

LazyLoad.prototype = {
    update: function(givenNodeset) {
        const settings = this._settings;
        const elementsToLoad = getElementsToLoad(givenNodeset, settings);
        this.toLoadCount = elementsToLoad.length;

        if (isBot || !supportsIntersectionObserver) {
            this.loadAll(elementsToLoad);
            return;
        }
        if (shouldUseNative(settings)) {
            loadAllNative(elementsToLoad, settings, this);
            return;
        }

        updateObserver(this._observer, elementsToLoad);
    },

    destroy: function() {
        // Observer
        if (this._observer) {
            this._observer.disconnect();
        }
        delete this._observer;
        delete this._settings;
        delete this.loadingCount;
        delete this.toLoadCount;
    },

    loadAll: function(elements) {
        const settings = this._settings;
        const elementsToLoad = getElementsToLoad(elements, settings);
        elementsToLoad.forEach(element => {
            load(element, settings, this);
        });
    },

    load: function(element) {
        /* DEPRECATED, REMOVE IN V.15 */
        load(element, this._settings, this);
    }
};

LazyLoad.load = (element, customSettings) => {
    const settings = getExtendedSettings(customSettings);
    load(element, settings);
};

/* Automatic instances creation if required (useful for async script loading) */
if (runningOnBrowser) {
    autoInitialize(LazyLoad, window.lazyLoadOptions);
}

export default LazyLoad;
