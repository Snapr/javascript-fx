/*jslint bitwise: true */

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Blends two layers together
 * @param {String} mode.
 * @constructor
 */
SnaprFX.Blender = function(mode){
    if(debug_logging){ console.log(' - Blend:', mode); }

    this.mode = this.blend_modes[mode];

    // does this blend mode require all RGB values
    if(this.mode.rgb){
        this.process = function(orig, overlay, opacity){

            // the the blended result
            overlay = this.mode.process(orig, overlay);

            // apply it to the underlying layer with opacity
            var mix = [];
            for (var channel = R; channel <= B; channel++) {
                mix[channel] = overlay[channel] * opacity + orig[channel] * (1 - opacity);
            }
            return mix;
        };
    // or can it work with the channels individually
    }else{
        this.process = function(orig, overlay, opacity){
            var mix = [];
            for (var channel = R; channel <= B; channel++) {
                mix[channel] = this.mode.process(orig[channel], overlay[channel]);
                mix[channel] = mix[channel] * opacity + orig[channel] * (1 - opacity);
            }
            return mix;
        };
    }
};

SnaprFX.Blender.prototype.blend_modes = {
    normal: {
        rgb: false,
        process: function(orig, overlay, opacity){ return overlay; }
    },

    multiply: {
        rgb: false,
        process: function(orig, overlay, opacity){
            return orig * overlay / 255;
        }
    },

    screen: {
        rgb: false,
        process: function(orig, overlay, opacity){
            return 255 - ( ((255-overlay)*(255-orig)) >> 8);
        }
    },

    overlay: {
        rgb: false,
        process: function(orig, overlay, opacity){
            if (orig < 128){
                return orig*overlay*(2 / 255);
            }else{
                return 255 - (255-orig)*(255-overlay)*(2 / 255);
            }
        }
    },

    darken: {
        rgb: false,
        process: function(orig, overlay, opacity){
            if(orig < overlay){
                overlay = orig;
            }
            return overlay;
        }
    },

    lighten: {
        rgb: false,
        process: function(orig, overlay, opacity){
            if(orig > overlay){
                overlay = orig;
            }
            return overlay;
        }

    },
    color_dodge: {
        rgb: false,
        process: function(orig, overlay, opacity){
            var x = (orig<<8)/(255-overlay);
            if (x > 255 || overlay == 255){
                return 255;
            }else{
                return x;
            }
        }
    },

    color_burn: {
        rgb: false,
        process: function(orig, overlay, opacity){
            var x = 255-((255-orig)<<8)/overlay;
            if (x < 0 || overlay === 0){
                return 0;
            }else{
                return x;
            }
        }
    },

    soft_light: {
        rgb: false,
        process: function(orig, overlay, opacity){
            if (orig < 128){
                return ((overlay>>1) + 64) * orig * (2/255);
            }else{
                return 255 - (191 - (overlay>>1)) * (255-orig) * (2/255);
            }
        }
    },

    hard_light: {
        rgb: false,
        process: function(orig, overlay, opacity){
            if (overlay < 128){
                return orig * overlay * (2/255);
            }else{
                return 255 - (255-orig) * (255-overlay) * (2/255);
            }
        }
    },

    difference: {
        rgb: false,
        process: function(orig, overlay, opacity){
            var x = orig - overlay;
            if (x < 0){
                return -x;
            }else{
                return x;
            }
        }
    },

    exclusion: {
        rgb: false,
        process: function(orig, overlay, opacity){
            return orig - (orig * (2/255) - 1) * overlay;
        }
    },

    hue: {
        rgb: true,
        process: function(orig, overlay, opacity){
            return overlay;
        }
    },

    saturation: {
        rgb: true,
        process: function(orig, overlay, opacity){
            return overlay;
        }
    },

    color: {
        rgb: true,
        process: function(orig, overlay, opacity){
            var orig_hsb = SnaprFX.utils.rgbToHsl(orig[0], orig[1], orig[2]),
                overlay_hsb = SnaprFX.utils.rgbToHsl(overlay[0], overlay[1], overlay[2]);

            return SnaprFX.utils.hslToRgb(overlay_hsb[0], overlay_hsb[1], orig_hsb[2]);
        }
    },

    luminosity: {
        rgb: true,
        process: function(orig, overlay, opacity){
            return overlay;
        }
    },

    subtract: {
        rgb: false,
        process: function(orig, overlay, opacity){
            overlay = orig - overlay;
            if(overlay < 0){
                overlay = 0;
            }
            return overlay;
        }
    },

    add: {
        rgb: false,
        process: function(orig, overlay, opacity){
            overlay = orig + overlay;
            if(overlay > 255){
                overlay = 255;
            }
            return overlay;
        }
    },

    divide: {
        rgb: false,
        process: function(orig, overlay, opacity){
            return (orig / overlay) * 255;
        }

    },
    linear_burn: {
        rgb: false,
        process: function(orig, overlay, opacity){
            if ((orig + overlay) < 255){
                return 0;
            }else{
                return (orig + overlay - 255);
            }
        }
    }
};
