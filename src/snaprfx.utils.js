/*global SnaprFX: false, JpegMeta: false */

/** @expose */
SnaprFX.utils = {
    rotated_dimensions: function(w,h,r){
        var width  = Math.abs(Math.cos(r)*w) + Math.abs(Math.sin(r)*h);
        var height = Math.abs(Math.sin(r)*w) + Math.abs(Math.cos(r)*h);
        return {width:width,height:height};
    },
    cart2polar: function(x,y){
        var rotation = Math.atan(y / x);
        if(y>0){
            if(x<0){
                rotation = Math.PI + rotation;
            }
        }else{
            if(x<0){
                rotation = Math.PI + rotation;
            }else{
                rotation = Math.PI*2 + rotation;
            }
        }
        return rotation;
    },
    pythag: function(x,y){
        return Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
    },
    /** @expose */
    preload_assets: function(options){
        var filter_pack, sticker_pack;
        $.ajax({
            url: options['filter_pack'] + 'filter-pack.json',
            success: function(pack){
                $.each(pack.filter_pack.sections, function(i, section){
                    $.each(section.filters, function(i, filter){

                        var filter_path = options['filter_pack']    + 'filters/' + filter.slug + '/';
                        // get filter details
                        $.ajax({
                            url: filter_path + 'filter.json',
                            success: function(data){

                                if(data.filter.fonts){
                                    $.each(data.filter.fonts, function(i, font){

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

                                        $('<style>'+css+'</style>').appendTo(document.head);

                                        // use font on page so it's preloaded
                                        $('<span style="font-family: '+font['font-family']+'"></span>').appendTo(document.body);

                                    });
                                }

                                $.each(data.filter.layers, function(i, layer){
                                    if(layer.type == 'image'){
                                        var image = new Image();
                                        image.src = filter_path+layer.image.image;
                                    }
                                });
                            }
                        });
                    });
                });
            }
        });
        $.ajax({
            url: options['sticker_pack'] + 'sticker-pack.json',
            success: function(pack){
                $.each(pack.sticker_pack.sections, function(i, section){
                    $.each(section.stickers, function(i, sticker){
                        var image = new Image();
                        image.src = options['sticker_pack']+'assets/'+sticker.slug+'.png';
                    });
                });
            }
        });
    },

    // Reads EXIF from a file identified by 'url'
    // Returns Deferred which resolves with selected EXIF properties
    read_exif: function(url){

        var deferred = $.Deferred();

        // use XHR to turn url (may be blob/file) into arraybuffer
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';

        /**
         * Reads data
         * @this {Object}
         */
        xhr.onload = function(e) {

            // read file as binary for exif extraction
            var exif_reader = new FileReader();

            /**
             * Extracts EXIF
             * @this {Object}
             */
            exif_reader.onloadend = function(){
                var exif = new JpegMeta.JpegFile(this.result, 'test.jpg');
                // exif reader no longer needed - GC can eat it
                exif_reader = null;
                xhr = null;
                deferred.resolve({
                    latitude: exif.gps && exif.gps.latitude && exif.gps.latitude.value,
                    longitude: exif.gps && exif.gps.longitude && exif.gps.longitude.value,
                    date: exif.exif && exif.exif.DateTimeOriginal && exif.exif.DateTimeOriginal.value,
                    orientation: exif.tiff && exif.tiff.Orientation && exif.tiff.Orientation.value
                });
            };
            var blob = new Blob([this.response]);
            exif_reader.readAsBinaryString(blob);
        };
        xhr.send();

        return deferred;
    },

    // based on http://mjijackson.com/2008/02/rgb-to-hsl-and-rgb-to-hsv-color-model-conversion-algorithms-in-javascript
    rgbToHsl: function(r, g, b){
        r /= 255, g /= 255, b /= 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var h, s, l = (max + min) / 2;

        if(max == min){
            h = s = 0; // achromatic
        }else{
            var d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch(max){
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        return [h, s, l];
    },
    hslToRgb: function(h, s, l){
        var r, g, b;

        if(s === 0){
            r = g = b = l; // achromatic
        }else{
            var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            var p = 2 * l - q;
            r = SnaprFX.utils.hueToRgb(p, q, h + 1/3);
            g = SnaprFX.utils.hueToRgb(p, q, h);
            b = SnaprFX.utils.hueToRgb(p, q, h - 1/3);
        }

        return [r * 255, g * 255, b * 255];
    },
    hueToRgb: function(p, q, t){
        if(t < 0){ t += 1; }
        if(t > 1){ t -= 1; }
        if(t < 1/6){ return p + (q - p) * 6 * t; }
        if(t < 1/2){ return q; }
        if(t < 2/3){ return p + (q - p) * (2/3 - t) * 6; }
        return p;
    }
};