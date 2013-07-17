/*global SnaprFX: false, dom:false, Deferred:false */

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var debug_borders = false;

SnaprFX.prototype.add_text = function(spec){  var self = this;
    spec.filter = new SnaprFX.filters.text(spec, self) ;
    self.filter_specs[self.current_filter].layers.push(spec);
};

/**
 * Text layer
 * @constructor
 * @param {Object} layer. Layer options.
 */
SnaprFX.filters.text = function(layer, fx){  var self = this;

    self.parent = fx;

    fx.text.push(self);
    self.slug = layer.slug;
    self.text_style = layer.text.style;
    self.text = fx.options.text && fx.options.text[layer.slug] || layer.text.default_value;

    self.canvas = new SnaprFX.Canvas({width: fx.canvas.width, height: fx.canvas.height});

    self.update(layer, fx);

};

SnaprFX.filters.text.prototype.calculate_position = function(layer, fx){  var self = this;

    if(fx.filter_specs[fx.current_filter].target_canvas){
        self.x_scale_factor = self.canvas.width / fx.filter_specs[fx.current_filter].target_canvas.width;
        self.y_scale_factor = self.canvas.height / fx.filter_specs[fx.current_filter].target_canvas.height;
    }else{
        self.x_scale_factor = self.y_scale_factor = 1;
    }

    if(layer.position && layer.position.bbox){
        self.position = {
            top: layer.position.bbox.top * self.y_scale_factor,
            bottom: layer.position.bbox.bottom * self.y_scale_factor,
            left: layer.position.bbox.left * self.x_scale_factor,
            right: layer.position.bbox.right * self.x_scale_factor
        };
    }else{
        self.position = {
            top: 0,
            bottom: self.canvas.height,
            left: 0,
            right: self.canvas.width
        };
    }

    if(layer.position){
        self.position.x = layer.position.x * self.x_scale_factor;
        self.position.y = layer.position.y * self.y_scale_factor;
    }

    self.bbox = {
        top: self.position.top,
        bottom: self.position.bottom,
        left: self.position.left,
        right: self.position.right
    };
};


SnaprFX.filters.text.prototype.set_canvas_font = function(){  var self = this;
    self.text_element.style.fontSize = parseInt(self.text_element.style.fontSize, 10) * self.render_scale + 'px';
    self.text_element.style.lineHeight = parseInt(self.text_element.style.lineHeight, 10) * self.render_scale + 'px';
    self.canvas.context.font = self.text_element.style.font;
    self.text_element.style.fontSize = parseInt(self.text_element.style.fontSize, 10) / self.render_scale + 'px';
    self.text_element.style.lineHeight = parseInt(self.text_element.style.lineHeight, 10) / self.render_scale + 'px';
};

SnaprFX.filters.text.prototype.update = function(layer, fx){  var self = this;

    self.rendered = (fx.options.render_text !== false || fx.render_options.render_text || fx.render_options.output) && (!fx.render_options.editable || fx.options.disable_text_edit);
    self.spec = layer;
    self.dragable = layer.position && layer.position.dragable;
    self.deferred = new Deferred();

    self.canvas.set_size(fx.canvas.width, fx.canvas.height);
    self.canvas.clear();

    self.calculate_position(layer, fx);

    self.create_overlay(layer, fx);

    // update text from overlay

    // strip HTML, replace <br> with newlines
    self.text = self.text_element.innerHTML
        .replace(/<br\/?>/g, '\n')  // <br> to newline
        .replace(/&nbsp;/g, ' ')  // non-breking space to normal space
        .replace(/<.*?>/g, '');  // strip html tags

    // but back stripped text with <br>s for newlines
    self.text_element.innerHTML = self.text.replace(/\n/g, '<br>');

    self.text_style.fillStyle = self.text_element.style.color;
    self.text_style.textAlign = self.element.style.textAlign;

    self.render_scale = self.canvas.height / fx.elements.overlay.offsetHeight;

    // set font properties on canvas
    self.set_canvas_font();
    self.canvas.context.textAlign = self.text_style.textAlign || 'left';
    self.canvas.context.textBaseline = self.text_style.textBaseline || 'top';
    self.canvas.context.fillStyle = self.text_style.fillStyle;

    self.text_style.fontSize = parseInt(self.text_element.style.fontSize, 10);
    self.text_style.lineHeight = parseInt(self.text_element.style.lineHeight, 10);

    // wrapping
    // --------

    var position = self.element.getBoundingClientRect();
    var overlay_position = fx.elements.overlay.getBoundingClientRect();
    console.log(position);
    console.log(overlay_position);
    self.position.left = parseInt(position.left, 10) - parseInt(overlay_position.left, 10);
    self.position.top = parseInt(position.top, 10) - parseInt(overlay_position.top, 10);
    self.position.right = self.position.left + parseInt(position.width, 10);
    self.position.bottom = self.position.top + parseInt(position.height, 10);

    var max_width = self.position.right - self.position.left,
        max_height = Math.round(self.position.bottom - self.position.top);

    function word_wrap(text, max_width){
        var orig_lines = text.split('\n'),
            lines = [],
            line_index = 0;

        for(var l=0; l < orig_lines.length; l++){
            var words = orig_lines[l].split(' ');
            lines[line_index] = words[0];

            for(var w=1; w < words.length; w++){
                var next_line_length = self.canvas.context.measureText(lines[line_index] + ' ' + words[w]).width;
                // if adding the next word would be too long then put the text in as it is
                if(next_line_length > max_width){
                    line_index++;
                    lines[line_index] = words[w];
                }else{
                    lines[line_index] = lines[line_index]  + ' ' + words[w];
                }
            }
            line_index++;
        }

        return lines;
    }

    var lines = word_wrap(self.text, max_width);
    var finite = 1000;
    while(finite && (!lines || (lines.length - 1) * self.text_style.lineHeight + self.text_style.fontSize > max_height)){
        finite--;


        self.text_style.fontSize = self.text_style.fontSize * 0.8;
        self.text_element.style.fontSize = self.text_style.fontSize + 'px';

        self.text_style.lineHeight = self.text_style.lineHeight * 0.8;
        self.text_element.style.lineHeight = self.text_style.lineHeight + 'px';

        self.set_canvas_font();

        lines = word_wrap(self.text, max_width);

    }
    if(!finite){ console.warn('render shrunk text 1000 times without success!'); }


    // positioning
    // -----------

    var x,
        y;

    // set x position for text based on alignment
    switch(self.text_style.textAlign){
        case 'end':
        case 'right':
            x = self.position.right;
            break;
        case 'center':
            x = max_width / 2 + self.position.left;
            break;
        default:  // left, start
            x = self.position.left;

    }
    x = x * self.render_scale;

    // set y position for text based on alignment
    switch(self.text_style.textBaseline){
        case 'hanging':
        case 'alphabetic':
        case 'ideographic':
        case 'bottom':
            // start No. of extra lines up from bottom
            y = self.position.bottom - (self.text_style.lineHeight * (lines.length - 1));
            break;
        case 'middle':
            y = (max_height / 2 + self.position.top) - ((self.text_style.lineHeight * (lines.length - 1)) / 2);
            break;
        default:  // top
            // start at top
            y = self.position.top;

    }
    y = y * self.render_scale;

    // draw text
    // ---------

    if(self.slug !== fx.render_options.active_text && !layer.removed){

        for(var l=0; l < lines.length; l++){

            if(debug_borders){
                // draws bounding box
                self.canvas.context.strokeRect(
                    self.position.left * self.x_scale_factor*self.render_scale,
                    y+l*self.text_style.lineHeight*self.render_scale,
                    max_width*self.render_scale,
                    self.text_style.lineHeight*self.render_scale
                );
            }

            self.canvas.context.fillText(lines[l], x, y+l*self.text_style.lineHeight*self.render_scale, max_width);

        }

    }

    self.pixels = self.canvas.get_data();
    self.deferred.resolve();
};
SnaprFX.filters.text.prototype.create_overlay = function(layer, fx){  var self = this;

    // stop if element already exists and is in dom
    if(self.element && self.element.parentNode){
        return;
    }

    self.overlay = fx.elements.overlay;

    var css = {
        position: 'absolute',
        left: self.position.left + 'px',
        top: self.position.top + 'px',
        width: self.position.right - self.position.left + 'px',
        height: self.position.bottom - self.position.top + 'px',
        'text-align': self.text_style.textAlign
    };

    if(self.position.x){
        switch(self.text_style.textAlign){
            case 'end':
            case 'right':
                css.width = self.position.x + 'px';
                break;
            case 'center':
                // if text is centered closer to left than right
                if(self.position.right - self.position.x < self.position.x - self.position.left){
                    css.width = (self.position.right - self.position.x) * 2 + 'px';
                    css.left = self.position.right - css.width + 'px';
                }else{
                    css.width = (self.position.x - self.position.left) * 2 + 'px';
                }
                break;
            default:  // left, start
                css.left = self.position.x + 'px';
                css.width = self.position.right - self.position.x + 'px';
        }
    }

    if(self.position.y){
        switch(self.text_style.textBaseline){
            case 'hanging':
            case 'alphabetic':
            case 'ideographic':
            case 'bottom':
                css.height = self.position.y;
                break;
            case 'middle':
                // if text is centered closer to top than bottom
                if(self.position.bottom - self.position.y < self.position.y - self.position.top){
                    css.height = (self.position.bottom - self.position.y) * 2;
                    css.top = self.position.bottom - css.height + 'px';
                }else{
                    css.height = (self.position.y - self.position.top) * 2;
                }
                break;
            default:  // top
                css.top = self.position.y + 'px';
                css.height = self.bbox.bottom - css.top;
        }
    }

    css.lineHeight = css.height;


    self.element  = dom.div('fx-text');
    dom.setStyle(self.element, css);

    if(self.rendered && (fx.options.render_text !== false || fx.render_options.render_text)){
        dom.addClass(self.element, 'fx-text-rendered');
    }

    self.wrapper = dom.div('fx-text-wrapper');
    dom.setStyle(self.wrapper, {'lineHeight': 'normal', 'vertical-align': self.text_style.textBaseline});

    // stop clicks inside the text bubbling up and trigering a click 'outside' the text, deactivating it
    self.wrapper.addEventListener('click', function(event){ event.stopPropagation(); });

    self.text_element = dom.div('fx-text-inner');
    self.text_element.setAttribute("data-layer", self.slug);
    dom.setStyle(self.text_element, {
        font: self.text_style.font,
        color: self.text_style.fillStyle
    });
    self.text_element.innerText = self.text;
    self.text_element.addEventListener('mousedown', function(){

        if(fx.options.disable_text_edit){
            return;
        }

        var active = dom.hasClass(self.element, 'fx-active'),
            rendered = dom.hasClass(self.element, 'fx-text-rendered');

        // deactivate all other text layers
        var to_deactivate_list = self.overlay.getElementsByClassName('fx-active');
        var to_deactivate_array = [];

        for (var i = 0; i < to_deactivate_list.length; ++i) {
            if(to_deactivate_list[i] !== self.element){
                to_deactivate_array.push(to_deactivate_list[i]);
            }
        }

        if(to_deactivate_array.length){
            self.deactivate(to_deactivate_array);
            fx.active_text = null;
        }


        // activate if not already active
        if(!active){
            dom.addClass(self.element, 'fx-active');
            dom.removeClass(self.element, 'fx-text-rendered');
            fx.trigger('activate_text', self.element, layer);

            fx.active_text = self;
        }

        dom.addClass(fx.elements.overlay, ' fx-editing-text');
        dom.removeClass(fx.elements.overlay, 'fx-editing-sticker');

        // remove text from rendered image
        if(rendered){
            fx.unrender_editables();
        }

    });
    self.text_element.addEventListener('dblclick', function(){
        self.editable = true;
        dom.addClass(self.element, 'fx-editable');
        self.text_element.setAttribute('contenteditable', true);
        self.text_element.focus();

        var range,selection;
        if(document.createRange)//Firefox, Chrome, Opera, Safari, IE 9+
        {
            range = document.createRange();//Create a range (a range is a like the selection but invisible)
            range.selectNodeContents(self.text_element);//Select the entire contents of the element with the range
            range.collapse(false);//collapse the range to the end point. false means collapse to end rather than the start
            selection = window.getSelection();//get the selection object (allows you to change selection)
            selection.removeAllRanges();//remove any selections already made
            selection.addRange(range);//make the range you have just created the visible selection
        }
        else if(document.selection)//IE 8 and lower
        {
            range = document.body.createTextRange();//Create a range (a range is a like the selection but invisible)
            range.moveToElementText(self.text_element);//Select the entire contents of the element with the range
            range.collapse(false);//collapse the range to the end point. false means collapse to end rather than the start
            range.select();//Select the range (make it the visible selection
        }

    });
    self.text_element.addEventListener('keyup', function(){
        self.check_size();
    });

    self.element.appendChild(self.wrapper);

    self.wrapper.appendChild(self.text_element);


    var delete_button = document.createElement('a');
    delete_button.className = 'fx-delete-layer fx-text-button';
    delete_button.innerText = '✗';
    dom.setStyle(delete_button, {
        position: 'absolute',
        top: 0,
        left: 0
    });
    // trigger removal
    delete_button.addEventListener('click', function(){ self.remove(); });
    self.wrapper.appendChild(delete_button);

    var render_button = document.createElement('a');
    render_button.className = 'fx-render-layer fx-text-button';
    render_button.innerText = '✔';
    dom.setStyle(render_button, {
        position: 'absolute',
        top: 0,
        right: 0
    });
    // trigger render
    render_button.addEventListener('click', function(){
        if(fx.options.render_text !== false || fx.render_options.render_text){
            fx.rerender_editables();
        }else{
            self.deactivate();
        }
    });
    self.wrapper.appendChild(render_button);

    // dragging
    // --------

    if(self.dragable){

        // move
        self.mousemove_drag = function(event){
            if(!self.rendered && !self.editable){
                var css = {};

                var drag_center, new_center;

                // set x position for text based on alignment
                var max_width = self.bbox.right - self.bbox.left;
                switch(self.text_style.textAlign){
                    case 'end':
                    case 'right':
                        css.width =  Math.min(event.pageX + self.drag_from.right - self.bbox.left, max_width);
                        break;
                    case 'center':
                        drag_center = (self.drag_from.right - self.drag_from.left) / 2;
                        new_center = event.pageX + drag_center + self.bbox.left;

                        css.width = ((new_center - self.bbox.left) - self.bbox.left) * 2;

                        if(css.width > max_width){
                            css.left = self.bbox.left + (css.width - max_width);
                            css.left = Math.min(css.left, self.bbox.left + max_width);
                            css.width = max_width - (css.left - self.bbox.left);
                        }
                        break;
                    default:  // left, start
                        css.left = Math.max(self.bbox.left, event.pageX - self.drag_from.left);
                        css.width =  self.bbox.right - css.left;

                }

                // set y bbox for text based on alignment
                var max_height = self.bbox.bottom - self.bbox.top;
                var current_height = self.text_element.offsetHeight - 18;
                switch(self.text_style.textBaseline){
                    case 'hanging':
                    case 'alphabetic':
                    case 'ideographic':
                    case 'bottom':
                        css.height =  Math.min(event.pageY + self.drag_from.bottom - self.bbox.top, max_height);
                        break;
                    case 'middle':
                        drag_center = (self.drag_from.bottom - self.drag_from.top) / 2;
                        new_center = event.pageY + drag_center + self.bbox.top;

                        // height  = distance  ((  from center   )   to top       ) * 2
                        css.height = ((new_center - self.bbox.top) - self.bbox.top) * 2;

                        // if the new height it too tall the new center must
                        // be closer to the bottom of the box than the top
                        if(css.height > max_height){
                            // top is equal to the overflowing portion
                            css.top = self.bbox.top + (css.height - max_height);
                            // top can't be so bit there is no room for text
                            css.top = Math.min(css.top, self.bbox.top + max_height - self.text_style.lineHeight);
                            // height takes up the rest of the bbox
                            css.height = max_height - (css.top - self.bbox.top);
                        }
                        break;
                    default:  // top
                        css.top = Math.min(self.bbox.bottom - current_height, event.pageY - self.drag_from.top);
                        css.top = Math.max(self.bbox.top, css.top);
                        css.height = self.bbox.bottom - css.top;
                }
                // height must be more then lineHeight
                css.height = Math.max(css.height, self.text_style.lineHeight);

                css.lineHeight = css.height + 'px';

                css.height += 'px';
                css.width += 'px';
                css.top += 'px';
                css.left += 'px';

                dom.setStyle(self.element, css);
            }
        };

        // finish drag
        self.mouseup = function(){
            fx.elements.wrapper.removeEventListener('mousemove', self.mousemove_drag);
        };
        fx.elements.wrapper.addEventListener('mouseup', self.mouseup);

        // start drag
        self.element.addEventListener('mousedown', function(event) {
            if(!self.rendered){

                var left = parseInt(self.element.style.left, 10);
                var top = parseInt(self.element.style.top, 10);
                var width = parseInt(self.element.style.width, 10);
                var height = parseInt(self.element.style.height, 10);

                self.drag_from = {
                    left: event.pageX - left,
                    right: (left+width) - event.pageX,
                    top: event.pageY - top,
                    bottom: (top+height) - event.pageY,
                    event: event
                };
                fx.elements.wrapper.addEventListener('mousemove', self.mousemove_drag);
            }

            dom.addClass(fx.elements.overlay, 'fx-editing-text');
            dom.removeClass(fx.elements.overlay, 'fx-editing-sticker');
        });
    }



    // font setup
    // ----------

    // apply scale factor to font size
    self.text_style.fontSize = parseInt(self.text_element.style.fontSize, 10) * self.y_scale_factor;
    self.text_element.style.fontSize = self.text_style.fontSize + 'px';

    // apply scale factor to line height
    // if line hight is % then convert it to px now
    self.text_style.lineHeight = self.text_element.style.lineHeight;
    if(self.text_style.lineHeight.substr(-1) == '%'){
        self.text_style.lineHeight = (parseInt(self.text_style.lineHeight, 10) / 100) * self.text_style.fontSize;
    }else{
        self.text_style.lineHeight = parseInt(self.text_style.lineHeight, 10) * self.y_scale_factor;
    }
    self.text_element.style.lineHeight = self.text_style.lineHeight + 'px';
    self.text_element.setAttribute('data-lineHeight-multiplier', self.text_style.lineHeight / self.text_style.fontSize);

    self.overlay.appendChild(self.element);
};

SnaprFX.filters.text.prototype.change_style = function(css){  var self = this;
    dom.setStyle(self.text_element, css);
    if('text-align' in css){
        self.element.style.textAlign = css['text-align'];
    }

    self.check_size();

};
SnaprFX.filters.text.prototype.check_size = function(css){  var self = this;

    self.text_style.fontSize = parseInt(self.text_element.style.fontSize, 10);
    self.text_style.lineHeight = parseInt(self.text_element.style.lineHeight, 10);

    var style = window.getComputedStyle(self.text_element, null);

    var finite = 1000;
    while(finite && (parseInt(style.width, 10) > self.element.offsetWidth || parseInt(style.height, 10) > Math.round(self.element.offsetHeight))){
        finite--;

        self.text_style.fontSize = self.text_style.fontSize * 0.99;
        self.text_element.style.fontSize = self.text_style.fontSize + 'px';

        self.text_style.lineHeight = self.text_style.lineHeight * 0.99;
        self.text_element.style.lineHeight = self.text_style.lineHeight + 'px';

    }
    if(!finite){ console.warn('check_size shrunk text 1000 times without success!'); }

};

SnaprFX.filters.text.prototype.remove = function(){  var self = this;
    self.element.style.display = 'none';
    self.spec.removed = true;
};
SnaprFX.filters.text.prototype.unrender = function(){  var self = this;
    dom.removeClass(self.element, 'fx-text-rendered');
};
SnaprFX.filters.text.prototype.rerender = function(){  var self = this;
    dom.addClass(self.element, 'fx-text-rendered');
};

SnaprFX.filters.text.prototype.deactivate = function(elements){  var self = this;

    function deactivate(element){
        dom.removeClass(element, 'fx-active');

        // only text has inner and needs extra attention
        var inner = element.getElementsByClassName('fx-text-inner')[0];
        if(inner){
            dom.removeClass(element, 'fx-editable');
            self.parent.trigger('deactivate_text', self.element);
            inner.setAttribute('contenteditable', false);
        }
    }

    if(elements){
        for (var i = 0; i < elements.length; ++i) {
            deactivate(elements[i]);
        }
    }else{
        deactivate(self.element);
    }

    self.editable = false;
};

SnaprFX.filters.text.prototype.process = function(i, rgb){  var self = this;
    if(!self.rendered){ return [0,0,0,0]; }
    return [self.pixels.data[i], self.pixels.data[i+1], self.pixels.data[i+2], self.pixels.data[i+3]];
};
