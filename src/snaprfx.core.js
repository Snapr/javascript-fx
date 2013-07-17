/*global define: false, JpegMeta: false, dom:false */

// FX Overview
// -----------

// Load image into canvas
// For each layer in effect
//     If the filter can operate on the whole Canvas
//         Put the px back on the canvas
//         Run the filter
//     If the filter runs px by px
//         Run the filter on each px

//     Create a blender to mix the results with the underlying image using the right blend mode
//         take into account overall layer opacity, px opacity from filter and opacity from mask

// put the px back on the canvas
// update img element

var debug_logging = true,
    debug_canvas = true;

// used to address vaues in pixel arrays in a more human-readible way. pixel[R] == red value
var R=0,G=1,B=2,O=3;

/**
 * Main Class
 * @param {Object} options.
 * @constructor
 * @expose
 */
var SnaprFX = function(options){ return this.init(options); };
window['SnaprFX'] = SnaprFX;

// SnaprFX
// -------

/** @expose */
SnaprFX.prototype.deferred = null;


// options: {
//     url: original image url (may be blob/file),
//     width/height: absolute dimentions - stretch to fit
//     size/aspect: max width or height / crop image to force this aspect (w/h)
// }
SnaprFX.prototype.init = function(options){  var self = this;

    self.deferred = new Deferred();

    self.options = options;
    self.render_options = {
        editable: false
    };

    self.handlers = {};

    // read EXIF first, it may have orientation
    // info needed for rendering the canvas
    SnaprFX.utils.read_exif(self.options.url).done(function(exif){

        self.exif = exif;

        self.load_original(true).done(function(){

            self.options.width = self.original.width;
            self.options.height = self.original.height;
            self.render_options.width = self.render_options.width || self.original.width;
            self.render_options.height = self.render_options.height || self.original.height;

            self.canvas = new SnaprFX.Canvas({
                width: self.original.width,
                height: self.original.height
            });

            self.canvas.context.drawImage(self.original.canvas, 0, 0);

            self.update_element();

            // timeout needed to ensure width/height
            // avaiable for sticker layer creation
            setTimeout(function(){
                self.create_overlay_elements();
                self.deferred.resolve();
            }, 1);
        });
    });

    /** @expose */
    self.load_filter_pack = new Deferred();
    var filter_request = new XMLHttpRequest();
    filter_request.onload = function(){
        self.filter_pack = JSON.parse(filter_request.response).filter_pack;
        self.filter_pack.base_path = self.options.filter_pack;
        self.load_filter_pack.resolve(self.filter_pack);

        self.load_fonts();
    };
    filter_request.open("get", self.options.filter_pack + 'filter-pack.json', true);
    filter_request.send();

    /** @expose */
    self.load_sticker_pack = new Deferred();
    var sticker_request = new XMLHttpRequest();
    sticker_request.onload = function(){
        self.sticker_pack = JSON.parse(sticker_request.response).sticker_pack;
        self.sticker_pack.by_slug = {};
        self.sticker_pack.base_path = self.options.sticker_pack;
        self.sticker_pack.sections.forEach( function(section){
            section.stickers.forEach( function(sticker){
                self.sticker_pack.by_slug[sticker.slug] = sticker;
            });
        });
        self.load_sticker_pack.resolve(self.sticker_pack);
    };
    sticker_request.open("get", self.options.sticker_pack + 'sticker-pack.json', true);
    sticker_request.send();

    self.current_filter = '_original';
    self.filter_specs = { _original: { name: "*Original*", slug: "_original", layers: [] } };
    self.stickers = [];
    self.text = [];
};

/**
 * Change the base image
 */
SnaprFX.prototype.set_url = function(url, callback){  var self = this;

    this.options.url = url;

    var deferred = new Deferred();

    // read EXIF first, it may have orientation
    // info needed for rendering the canvas
    SnaprFX.utils.read_exif(self.options.url).done(function(exif){

        self.exif = exif;

        self.load_original(true).done(function(){

            self.apply_filter({editable: self.render_options.editable});
            deferred.resolve();

        });
    });

    return deferred;
};

SnaprFX.prototype.set_options = function(options){  var self = this;
    var render_text = self.options.render_text;

    for(var key in options){
        self.options[key] = options[key];
    }

    // if render_text just got turned on then render it
    if(!render_text && self.options.render_text){
        self.apply_filter({render_text: true, editable:false});
    }

    if(self.options.disable_text_edit === true){
        dom.addClass(self.elements.overlay, 'fx-text-disabled');
    }else{
        dom.removeClass(self.elements.overlay, 'fx-text-disabled');
    }
    if(self.options.disable_sticker_edit === true){
        dom.addClass(self.elements.overlay, 'fx-stickers-disabled');
    }else{
        dom.removeClass(self.elements.overlay, 'fx-stickers-disabled');
    }
};


/**
 * Loads any custom fonts onto page
 */
SnaprFX.prototype.load_fonts = function(){  var self = this;

    self.filter_pack.sections.forEach( function(section){
        section.filters.forEach( function(filter){

            var filter_path = self.filter_pack.base_path + 'filters/' + filter.slug + '/';
            // get filter details
            var filter_request = new XMLHttpRequest();
            filter_request.onload = function(){
                // cache
                self.filter_specs[filter.slug] = JSON.parse(filter_request.response).filter;

                if(self.filter_specs[filter.slug].fonts){
                    self.filter_specs[filter.slug].fonts.forEach( function(font){

                        var css = "@font-face {";
                        css += "font-family: '"+font['font-family']+"';";
                        if(font['font-weight']){ css += "font-weight: "+font['font-weight']+";"; }
                        if(font['font-style']){ css += "font-style: "+font['font-style']+";"; }
                        if(font.eot){ css += "src: url('"+filter_path + 'fonts/'+font.eot+"');"; }
                        css += "src:";
                        if(font.eot){ css += "url('"+filter_path + 'fonts/'+font.eot+"?#iefix') format('embedded-opentype'),"; }
                        if(font.woff){ css += "url('"+filter_path + 'fonts/'+font.woff+"') format('woff'),"; }
                        if(font.ttf){ css += "url('"+filter_path + 'fonts/'+font.ttf+"') format('truetype'),"; }
                        if(font.svg){ css += "url('"+filter_path + 'fonts/'+font.svg+"#"+font['font-family']+"') format('svg');"; }
                        css += "}";

                        var style = document.createElement('style');
                        style.type = 'text/css';
                        if (style.styleSheet){
                            style.styleSheet.cssText = css;
                        }else{
                            style.appendChild(document.createTextNode(css));
                        }
                        document.head.appendChild(style);

                        // use font on page so it's preloaded
                        var span = document.createElement('span');
                        span.style['font-family'] = font['font-family'];
                        document.body.appendChild(span);

                    });
                }
            };
            filter_request.open("get", filter_path + 'filter.json', true);
            filter_request.send();
        });
    });
};

// loads the original image onto this.canvas
// includes any stickers unless 'stickers' === false
SnaprFX.prototype.load_original = function(stickers){  var self = this;

    var deferred = new Deferred();

    // TODO: do we need to create a new canvas each time?
    self.original = new SnaprFX.Canvas({
        url: self.options.url,
        size: self.options.size,
        aspect: self.options.aspect,
        width: self.options.width,
        height: self.options.height,
        orientation: self.exif && self.exif.orientation
    });

    // stop here if we aren't rendering the Stickers
    // defaults to true

    self.original.deferred.done(function(){
        if(stickers === false){
            deferred.resolve();
        }else{
            self.render_stickers().done(function(){
                deferred.resolve();
            });
        }
    });


    return deferred;
};

// sets the html element's src to our canvas data
SnaprFX.prototype.update_element = function(){  var self = this;
    self.options.element.setAttribute('src', self.canvas.get_data_url());
};

/**
 * apply filter specified by 'filter' or reapply last filter
 * apply stickers unless stickers: false
 * @param {Object} options.
 * @expose
 */
SnaprFX.prototype.apply_filter = function(options){  var self = this;

    self.deferred = new Deferred();

    dom.addClass(document.body, 'fx-processing');

    setTimeout(function(){

        options = options || {};

        // defaults
        var defaults = {
            filter: self.current_filter,
            editable: false,
            width: self.options.width,
            height: self.options.height
        };
        for(var key in defaults){
            if(!(key in options)){
                options[key] = defaults[key];
            }
        }

        self.render_options = options;

        if(!options.editable && !options.output){
            self.deferred.done(function(){
                if(self.options.render_text !== false || self.render_options.render_text){
                    self.text.forEach( function(text){
                        text.rerender();
                    });
                }

                self.stickers.forEach( function(sticker){
                    sticker.rerender();
                });
            });
        }

        // remove text frames from prev filter
        if(options.filter != self.current_filter){

            // remember current text as old
            self.elements.old_text = [];
            var current = self.elements.overlay.getElementsByClassName('fx-text');
            // put it in an array to avoid live nodeList updating
            for (var i = current.length - 1; i >= 0; i--) {
                self.elements.old_text.push(current[i]);
            };

            // destroy rendered version with no text/stickers
            self.without_extras = null;
        }

        if(debug_logging){ console.group(options.filter); }

        self.current_filter = options.filter;

        // the function that actually does the work
        function apply(){

            var filter_spec = self.filter_specs[self.current_filter];

            if(filter_spec){
                filter_spec.layer_index = -1;  // so first time we call 'next' layer it's 0
            }

            if(self.render_options.region){
                if(debug_logging){ console.log('region', self.render_options.region); }
                var r = self.render_options.region;
                self.canvas.context.drawImage(
                    self.original.canvas,
                    r.left, r.top, r.width, r.height,
                    r.left, r.top, r.width, r.height
                );
            }else{
                var done = false;
                function draw_original(){
                    if(done){
                        self.canvas.context.drawImage(self.original.canvas, 0, 0);
                    }
                    done = true;
                }
                self.canvas.set_size(self.render_options.width, self.render_options.height).done(draw_original);
                self.original.set_size(self.render_options.width, self.render_options.height).done(draw_original);
            }


            var filter = function(){
                self.pixels = self.canvas.get_data();
                self.apply_next_layer();
            };

            if(!options.editable || self.options.disable_sticker_edit){
                self.render_stickers().done(filter);
            }else{
                filter();
            }

        }

        if(!options.filter){
           setTimeout(apply, 4);
        }else{
            // run the above function, getting the spec first if not in cache
            if(options.filter in self.filter_specs){
                setTimeout(apply, 4);
            }else{
                var filter_request = new XMLHttpRequest();
                filter_request.onload = function(){
                    // cache
                    if(debug_logging){ console.log('loaded', options.filter); }
                    self.filter_specs[options.filter] = JSON.parse(filter_request.response).filter;
                    setTimeout(apply, 4);
                };
                filter_request.open("get", self.filter_pack.base_path + 'filters/' + options.filter + '/filter.json', true);
                filter_request.send();
            }
        }
    }, 4);

};

SnaprFX.prototype.output = function(options){  var self = this;

    var deferred = new Deferred();

    self.apply_filter({
        output: true,
        width: options.width,
        height: options.height
    });
    self.deferred.done(function(){
        deferred.resolve(self.canvas.get_data_url());
    });

    return deferred;
};

// "main" function - runs filter on px and puts them back
// on canvas with mask image and blend mode applied
SnaprFX.prototype.apply_next_layer = function(){  var self = this;
    // apply_next_layer allows processing to be deffered until something is ready (eg, loading mask image)
    // after this layer is finished apply_next_layer will be called again

    var filter_spec = self.filter_specs[self.current_filter];

    // move pointer to next layer
    filter_spec.layer_index++;

    // if there are no more layers we are done!
    if(filter_spec.layer_index >= filter_spec.layers.length){
        self.finish();
        return;
    }

    if(debug_logging){ console.time("applying " + filter_spec.layers[filter_spec.layer_index].type + " layer"); }

    if(debug_logging){ console.log("applying", filter_spec.layers[filter_spec.layer_index].type, "layer"); }

        // this layers spec
    var layer = filter_spec.layers[filter_spec.layer_index];
    // filter processes the px
    if(layer.filter){
        layer.filter.update && layer.filter.update(layer, self);
    }else{
        layer.filter = new SnaprFX.filters[layer.type](layer, self);
    }
    // blender mixes this layer with underlying
    layer.blender = layer.blender || new SnaprFX.Blender(layer.blending_mode || 'normal');

    // when the filter is ready (may need to load an image etc)
    layer.filter.deferred.done(function(){


        // some filters (eg blur) need the whole canvas - they can't work px by px
        // we store the result and blend it in px by px using blender/mask image
        var whole_canvas_result;
        if(layer.filter.whole_canvas){
            // put results of any underlying filters back on canvas
            // (not needed if this is the first layer - they are already there)
            if(filter_spec.layer_index !== 0){
                self.canvas.put_data(self.pixels);
            }

            // run the filter
            layer.filter.process(self.canvas);

            whole_canvas_result = self.canvas.get_data();
        }

        var mask_pixels;

        // function that gets result pixels and blends into existing ones
        function blend(){

            var region = self.render_options.region || {
                left: 0,
                top: 0,
                width: self.canvas.width,
                height: self.canvas.height
            };
            var i;

            //if(debug_logging){ console.log(region); }
            for ( var y = region.top; y < region.top+region.height; y += 1 ) {
                for ( var x = region.left; x < region.left+region.width; x += 1 ) {

                    i = (y * self.canvas.width + x) * 4;

                    var rgb;
                    if(layer.filter.whole_canvas){
                        // whole canvas has been processed by filter
                        // get relivent px
                        rgb = [whole_canvas_result.data[i], whole_canvas_result.data[i+1], whole_canvas_result.data[i+2], whole_canvas_result.data[i+3]];
                    }else{
                        // process this px now
                        rgb = layer.filter.process(i, [self.pixels.data[i], self.pixels.data[i+1], self.pixels.data[i+2]]);
                    }

                    // start with opacity for px returned by filter
                    var opacity = rgb[O];
                    if(opacity >= 0){  // >= 0 ensures a number (that's positive too)
                        opacity = opacity / 255;
                    }else{
                        opacity = 1;
                    }
                    // * opacity of this px from mask
                    if(layer.mask_image){
                        opacity = opacity * (mask_pixels.data[i]/255);
                    }
                    // * opacity of this whole layer
                    opacity = opacity * (layer.opacity/100);

                    // blend this layer with underlying
                    rgb = layer.blender.process(
                        [self.pixels.data[i], self.pixels.data[i+1], self.pixels.data[i+2]],
                        [rgb[R], rgb[G], rgb[B]],
                        opacity
                    );
                    self.pixels.data[i  ] = rgb[R];
                    self.pixels.data[i+1] = rgb[G];
                    self.pixels.data[i+2] = rgb[B];
                }
            }

            if(debug_logging){ console.timeEnd("applying " + filter_spec.layers[filter_spec.layer_index].type + " layer"); }
            self.apply_next_layer();
        }

        // if there's a mask we must adjust each of the new px opacity accordingly
        if(layer.mask_image){

            // load mask image
            var mask = new SnaprFX.Canvas({
                url: self.filter_pack.base_path + 'filters/' +filter_spec.slug+'/'+layer.mask_image, width:
                self.canvas.width, height:
                self.canvas.height
            });
            mask.deferred.done(function(){
                mask_pixels = mask.get_data();
                blend();
            });
        }else{
            blend();
        }
    });
};

// once all layers are processed this puts the data back on the
// canvas, updates the element and resolves self.deffered
SnaprFX.prototype.finish = function(){  var self = this;
    // put px back in canvas

    if(debug_logging){ console.time('writing data back'); }

    if(self.elements.old_text){
        self.elements.old_text.forEach(function(element){
            if(element.parentNode){
                self.elements.overlay.removeChild(element);
            }
        });
    }

    self.canvas.put_data(self.pixels);
    if(!self.render_options.output){
        self.update_element();
    }
    self.deferred.resolve();

    dom.removeClass(document.body, 'fx-processing');


    var text_rendered = self.options.render_text !== false || self.render_options.render_text;
    var stickers_rendered = self.stickers.length;
    if(((!text_rendered && !stickers_rendered) || self.render_options.editable) && !self.render_options.output){
        self.without_extras = self.canvas.clone();
    }

    if(debug_logging){ console.timeEnd('writing data back'); }

    if(debug_logging){ console.groupEnd(self.current_filter); }
};

// removes stickers/text from render and displays their html overaly elements
SnaprFX.prototype.unrender_editables = function(){  var self = this;

    if(!self.options.disable_sticker_edit){
        self.stickers.forEach( function(sticker){
            sticker.unrender();
        });
    }

    if(!self.options.disable_text_edit){
        self.text.forEach( function(text){
            text.unrender();
        });
    }

    if(self.without_extras){
        self.canvas.context.drawImage(self.without_extras.canvas, 0, 0);
        self.update_element();
        self.render_options.editable = true;
    }else{
        self.apply_filter({editable: true});
    }
};

// replaces stickers/text in render and hides their html overaly elements
SnaprFX.prototype.rerender_editables = function(){  var self = this;

    // revert to orig with no stickers
    self.apply_filter({editable: false});

};

// initialise sticker and text overlay layers
SnaprFX.prototype.create_overlay_elements = function(){  var self = this;
    // store actual image, sticker div and a wrapper for both
    self.elements = {image: self.options.element};
    var overlay = self.elements.overlay = dom.div('fx-overlay-layer');
    dom.setStyle(overlay, {
        position:  'absolute',
        top:  0,
        left:  0,
        height:  '100%',
        width:  '100%'
    });
    overlay.addEventListener('click', function(event){
        if(self.render_options.editable){
            self.rerender_editables();
        }
    });
    var wrapper = self.elements.wrapper = dom.div('fx-wrapper');
    dom.setStyle(wrapper, {
        position: 'relative',
        height: self.options.height,
        width: self.options.width
    });

    // put wrapper on page
    self.elements.image.parentNode.insertBefore(wrapper, self.elements.image.nextSibling);

    // put elements in wrapper
    wrapper.appendChild(self.elements.image);
    wrapper.appendChild(overlay);

    var offset = overlay.getBoundingClientRect();
    self.elements.overlay.offset_cache = {
        left: offset.left + window.pageXOffset,
        top: offset.top + window.pageYOffset
    };
};

SnaprFX.prototype.on = function(event, handler){  var self = this;
    if(!self.handlers[event]){
        self.handlers[event] = [];
    }
    self.handlers[event].push(handler);
};
SnaprFX.prototype.trigger = function(event, element, data){  var self = this;
    if(self.handlers[event]){
       self.handlers[event].forEach(function(handler){
           handler.call(element, data);
       });
    }
};

// require.js module
// -----------------

if ( typeof define === "function" && define.amd ) {
    define(function(){return SnaprFX;});
}
