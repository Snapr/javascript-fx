/*global SnaprFX: false, dom:false, Deferred:false */

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// create a new sticker
/** @expose */
SnaprFX.prototype.add_sticker = function(slug){  var self = this;

    if(!self.deferred || !self.deferred.resolved){
        console.warn('Not ready yet');
        return;
    }

    var sticker = new SnaprFX.sticker(slug, self);
    self.stickers.push(sticker);
    sticker.deferred.done(function(){
        self.elements.overlay.appendChild(sticker.element);
        var active = self.elements.overlay.getElementsByClassName('fx-active');
        for(var i=0; i < active.length; i++){
            dom.removeClass(active[i], 'fx-active');
        }
        dom.addClass(sticker.element, 'fx-active');
    });

    self.render_options.editable = true;

};

SnaprFX.prototype.render_stickers = function(){  var self = this;

    var deferred = new Deferred();

    // function to check if all other stickers
    // are placed after each on is done
    function check_stickers_resolved(){
        var done = true;
        self.stickers.forEach(function(sticker){
            if(!sticker.deferred.resolved){
                done = false;
                return false; // break each
            }
        });
        if(done){
            deferred.resolve();
        }
    }

    // when canvas is ready, place stickers
    self.original.deferred.done(function(){

        // resolve if there are no stickers
        if(!self.stickers.length){
            deferred.resolve();
        }

        // place each sticker
        self.stickers.forEach(function(sticker){
            sticker.render(self.canvas).done(check_stickers_resolved);
        });
    });

    return deferred;
};

// Sticker class
/**
 * Sticker class
 * @param {string} slug. The sticker slug.
 * @param {Object} parent. An instance of SnaprFX.
 * @constructor
 */
SnaprFX.sticker = function(slug, parent){  var self = this;
    self.slug = slug;
    self.parent = parent;

    self.scale = 1;
    self.rotation = 0;

    self.spec = parent.sticker_pack.by_slug[slug];

    self.deferred = new Deferred();

    self.load().done(function(){

        self.scale_factor = Math.min(parent.canvas.width / parent.sticker_pack.target_canvas.width, parent.canvas.height / parent.sticker_pack.target_canvas.height);

        // Build element
        // -------------

        self.element = dom.div('fx-sticker fx-sticker-rendered');

        var deactivate_text = function(event){

            // stop clicks inside the sticker bubbling up and trigering a click 'outside' the sticker, deactivating it
            event.stopPropagation();

            if(parent.active_text){
                parent.active_text.deactivate();
            }

        };
        self.element.addEventListener('click', deactivate_text);
        self.element.addEventListener('touch', deactivate_text);

        var html = '<img class="fx-sticker-image" src="'+self.parent.sticker_pack.base_path+'assets/'+slug+'.png">';

        self.element.innerHTML = html;

        var css = {
            position: 'absolute',
            width: self.image.width * self.scale_factor,
            height: self.image.height * self.scale_factor
        };

        if(self.spec.position && self.spec.position.x){
            css.left = self.spec.position.x * self.scale_factor - css.width/2;
            css.top = self.spec.position.y * self.scale_factor - css.height/2;
        }else{
            css.left = parent.canvas.width/2 - css.width/2;
            css.top = parent.canvas.height/2 - css.height/2;
        }

        css.width += 'px';
        css.height += 'px';
        css.left += 'px';
        css.top += 'px';

        dom.setStyle(self.element, css);

        self.initial = css;

        if(!self.rendered){
            dom.removeClass(self.element, 'fx-sticker-rendered');
        }

        // events
        // ------

        // render button
        self.element.innerHTML += '<a class="fx-render-sticker fx-sticker-handle" data-role="button" data-icon="tick" data-iconpos="notext" data-theme="e">✔</a>';
        setTimeout(function(){
            var render = function(event){
                parent.rerender_editables();
                // stop click porpegating up to sticker element and triggering unrender right after rerender
                event.stopPropagation();
            };
            var button =  self.element.getElementsByClassName('fx-render-sticker')[0];
            button.addEventListener('click', render);
            button.addEventListener('touch', render);
        }, 4);

        // delete button
        self.element.innerHTML += '<a class="dd fx-remove-sticker fx-sticker-handle" data-role="button" data-icon="delete" data-iconpos="notext" data-theme="e">✗</a>';
        setTimeout(function(){
            var button = self.element.getElementsByClassName('fx-remove-sticker')[0];
            button.addEventListener('click', function(){ self.remove(); });
            button.addEventListener('touch', function(){ self.remove(); });
        }, 4);
        // click to unrender
        var unrender = function(){
            if(self.parent.options.disable_sticker_edit){
                return;
            }
            if(self.rendered){
                parent.unrender_editables();
            }

            // deactivate all other layers
            var to_deactivate = parent.elements.overlay.getElementsByClassName('fx-active');

            for (var i = 0; i < to_deactivate.length; ++i) {
                dom.removeClass(to_deactivate[i], 'fx-active');
            }

            dom.addClass(self.element, 'fx-active');
            dom.removeClass(self.element, 'fx-sticker-rendered');
        };
        self.element.addEventListener('mousedown', unrender);
        self.element.addEventListener('touchstart', unrender);

        // dragging
        // --------

        // move
        self.mousemove_drag = function(event){
            if(!self.rendered){
                dom.setStyle(self.element, {
                    left: event.pageX - self.drag_from.left + 'px',
                    top: event.pageY - self.drag_from.top + 'px'
                });
            }
        };

        // finish drag
        self.mouseup = function(){

            parent.elements.wrapper.removeEventListener('mousemove', self.mousemove_drag);
            parent.elements.wrapper.removeEventListener('mousemove', self.mousemove_scale);
            parent.elements.wrapper.removeEventListener('touchmove', self.mousemove_drag);
            parent.elements.wrapper.removeEventListener('touchmove', self.mousemove_scale);
        };
        parent.elements.wrapper.addEventListener('mouseup', self.mouseup);
        parent.elements.wrapper.addEventListener('touchend', self.mouseup);

        // start drag
        var drag = function(event) {
            if(!self.rendered){

                var left = parseInt(self.element.style.left, 10);
                var top = parseInt(self.element.style.top, 10);

                self.drag_from = {
                    left: event.pageX - left,
                    top: event.pageY - top,
                    event: event
                };
                parent.elements.wrapper.addEventListener('mousemove', self.mousemove_drag);
                parent.elements.wrapper.addEventListener('touchmove', self.mousemove_drag);
            }

            dom.addClass(parent.elements.overlay, 'fx-editing-sticker');
            dom.removeClass(parent.elements.overlay, 'fx-editing-text');
        };
        self.element.addEventListener('mousedown', drag);
        self.element.addEventListener('touchstart', drag);

        // Scaling
        // -------
        self.mousemove_scale = function(event){
            // stop event propagating and causeing the sticker to drag too
            event.stopPropagation();
            if(!self.rendered){

                var distance = SnaprFX.utils.pythag(event.pageX-self.scale_from.x, event.pageY-self.scale_from.y);
                self.scale = distance/self.scale_from.size;
                self.scale = Math.max(self.scale, 0.15);

                var rotation = SnaprFX.utils.cart2polar(event.pageX-self.scale_from.x, event.pageY-self.scale_from.y);

                self.rotation = -self.scale_from.rotation+rotation;

                var width = parseInt(self.initial.width, 10) * self.scale;
                var height = parseInt(self.initial.height, 10) * self.scale;

                var offset = self.parent.elements.overlay.getBoundingClientRect();

                dom.setStyle(self.element, {
                    webkitTransform: 'rotate('+Math.round(self.rotation/(2*Math.PI) * 360)+'deg)',
                    transform: 'rotate('+Math.round(self.rotation/(2*Math.PI) * 360)+'deg)',
                    width: width + 'px',
                    height: height + 'px',
                    top: self.scale_from.y - height/2 - offset.top - window.pageYOffset + 'px',
                    left: self.scale_from.x - width/2 - offset.left - window.pageXOffset + 'px'
                });
            }
        };

        // start scale
        self.element.innerHTML += '<a class="fx-scale-sticker fx-sticker-handle" data-role="button" data-icon="rotate" data-iconpos="notext" data-theme="e"> </a>';
        setTimeout(function(){
            var scale = function(event) {
                event.stopPropagation();
                if(!self.rendered){
                    var image = self.element.getElementsByClassName('fx-sticker-image')[0],
                        bounds = image.getBoundingClientRect();

                    self.scale_from = {

                        // remember where the center is, the change in mouse distance/angle from this is scale/rotation
                        x: bounds.left + bounds.width / 2 - 5 + window.scrollX,
                        y: bounds.top + bounds.height / 2 - 5 + window.scrollY,
                        // remember distance from center to corner, change in this = change in scale
                        size: SnaprFX.utils.pythag(self.element.offsetHeight, self.element.offsetWidth) / 2 / self.scale,
                        // remember current scale so new scale can be proportional
                        scale: self.scale
                    };
                    // remember current rotation to apply change in rotation on top of
                    self.scale_from.rotation = SnaprFX.utils.cart2polar(event.pageX-self.scale_from.x, event.pageY-self.scale_from.y) - self.rotation;

                    parent.elements.wrapper.addEventListener('mousemove', self.mousemove_scale);
                    parent.elements.wrapper.addEventListener('touchmove', self.mousemove_scale);
                }
            };
            var button =  self.element.getElementsByClassName('fx-scale-sticker')[0];
            button.addEventListener('mousedown', scale);
            button.addEventListener('touchstart', scale);
        }, 4);


        // prevent default drag (like drag image to desktop)
        self.element.addEventListener('dragstart', function(event) { event.preventDefault(); });  // stop normal dragging of image
        self.element.addEventListener('touchmove', function(event) { event.preventDefault(); });  // stop normal dragging of image

        self.deferred.resolve();

    });
};

// load sticker image
SnaprFX.sticker.prototype.load = function(){  var self = this;

    if(self.load_deferred){
        return self.load_deferred;
    }

    self.load_deferred = new Deferred();

    // get image
    self.image = new Image();
    self.image.src = self.parent.sticker_pack.base_path+'assets/'+self.slug+'.png';

    self.image.onload = function() {
        self.load_deferred.resolve();
    };

    return self.load_deferred;

};

// render sticker into actual image
SnaprFX.sticker.prototype.render = function(canvas){  var self = this;

    self.deferred = new Deferred();

    var sticker = self.element.getElementsByClassName('fx-sticker-image')[0],
        layer = self.element.parentNode,
        sticker_bounds = self.element.getElementsByClassName('fx-sticker-image')[0].getBoundingClientRect(),
        layer_bounds = self.element.parentNode.getBoundingClientRect(),

        x = (sticker_bounds.left - layer_bounds.left) / layer_bounds.width,
        y = (sticker_bounds.top - layer_bounds.top) / layer_bounds.height,
        w = sticker.offsetWidth / layer_bounds.width * canvas.width,
        h = sticker.offsetHeight / layer_bounds.height * canvas.height;

    var r = self.rotation, PI = Math.PI;
    if(r>2*PI){r-=2*PI;}
    if(r<0){r+=2*PI;}
    var sin = Math.sin(r);
    var cos = Math.cos(r);

    // account for rotation
    if(r < PI/2){  // < 90
        x += sin*h / canvas.width;
    }else if(r > PI*1.5){  // > 270
        y += -sin*w / canvas.height;
    }else if(r > PI/2 && r < PI){  // > 90
        x += (sin*h + -cos*w) / canvas.width;
        y += -cos*h / canvas.height;
    }else{  // > 180
        x += -cos*w / canvas.width;
        y += (-cos*h - sin*w) / canvas.height;
    }

    self.load().done(function() {
        // place sticker
        canvas.context.translate(x * canvas.width, y * canvas.height);
        canvas.context.rotate(self.rotation);
        canvas.context.drawImage(self.image, 0,0, self.image.width, self.image.height ,0 ,0 ,w ,h);
        canvas.context.rotate(-self.rotation);
        canvas.context.translate(-x * canvas.width, -y * canvas.height);
        // notify that it's ready
        self.deferred.resolve();
    });

    return self.deferred;
};

// remove sticker from image, show html overlay
SnaprFX.sticker.prototype.unrender = function(){  var self = this;

    // track if it's rendered in image or html overlay
    self.rendered = false;

    dom.removeClass(self.element, 'fx-sticker-rendered');
};


SnaprFX.sticker.prototype.rerender = function(){  var self = this;

    // track if it's rendered in image or html overlay
    self.rendered = true;

    dom.addClass(self.element, 'fx-sticker-rendered');
};

SnaprFX.sticker.prototype.remove = function(){  var self = this;

    // remove html overlay
    self.parent.elements.overlay.removeChild(self.element);

    // remove events
    self.parent.elements.wrapper.removeEventListener('mousemove', self.mousemove);
    self.parent.elements.wrapper.removeEventListener('mouseup', self.mouseup);

    // remove from SnaprFX's list
    self.parent.stickers.forEach( function(sticker, i){
        if(sticker == self){
            self.parent.stickers.splice(i, 1);
        }
    });
};

SnaprFX.sticker.prototype.get_dimensions = function(){  var self = this;
    return SnaprFX.utils.rotated_dimensions(self.element.offsetWidth, self.element.offsetHeight, -self.rotation);
};
