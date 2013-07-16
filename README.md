Snapr Javascript FX
=====================

1. [Overview](#1-overview)
2. [API's](#2-APIs)
3. [Text](#3-Text)



1. Overview
----------------------

Snapr's Javascript FX Library renders photo filters & sticker packs on the web and mobile web. 

Snapr has open source formats for defining both [filters](https://github.com/Snapr/filters/) and [stickers](https://github.com/Snapr/stickers).

These formats can also be read by Snapr's native modules for iOS & Android which will be released to the public at a later date.

The demo project illustrates how you can use the library to:

* Create custom photo filters with advanced layering, blend modes, grading, & masking.
* Include editable, fully styled, text in your designs.
* Create stickers packs & build a UI for adding stickers to an image


2. API's
-----------------------

### 2.1 Preloading

In order to speed up applying filters assets such as image layers, masks, and custom fonts can be preloaded:

    SnaprFX.utils.preload_assets({
        filter_pack: "path/to/filter-pack-directory/",
        sticker_pack: "path/to/sticker-pack-directory/"
    });


### 2.2 Browser compatiblity

The library is written for modern browsers that have good support for the HTML 5 `<canvas>` element.

To check compatibility: `SnaprFX.utils.compatible` returns true or false

    if(!SnaprFX.utils.compatible()){ ... }


### 2.3 Initialization

    MyImageInstance = new SnaprFX(options);


##### options

- url: path to original image
- element: img element to output to
- width: output width
- height: output height
- filter_pack: path/to/filter-pack-directory/
- sticker_pack: path/to/sticker-pack-directory/
- text: initial values for text fields. eg. `{ title: "The Sneeches", author: "Dr Seuss" }`
- render_text: If false text not be automatically rendered with filters it will be previewed as css overlay


##### Deferred

Two deferred objects are available for callbacks

    MyImageInstance.load_filter_pack
    MyImageInstance.load_sticker_pack


### 2.4 Apply filters

    MyImageInstance.apply_filter({
        filter: "slug",
        render_text: true,  // override render_text option
        editable: false,  // if false text and sticker elements are forced to render
        width: 200,  // override width
        height: 300,  // override height
        region: {left: 100, top: 100, width: 100, height: 100}  // render only specified region
    });


### 2.5 Alternate Output Size

You can create an uneditable version of your image at any size.

This could be used to create high resolution final output, or low resolution thumbnail previews.

    MyImageInstance.output({
        width: 560,
        height: 750
    });

Output ready:

url is full image data as [Data URI Scheme](https://en.wikipedia.org/wiki/Data_URI_scheme)


    output.done(function(url){
        // display or use url
        ...
    });


### 2.6 Change source image

Use a different base image:

    MyImageInstance.set_url(new_src);
    



3. Text
----------------------

The library renders text into the image using `<canvas>` text.

While editing text an editable CSS styled version of the text is made visible.

### 3.1 Activation

When the user clicks some text and it becomes active a custom event is fired on
the text emement with details about the text. The data object format matches
text layers in the filter json.

    $('.fx-text').live('activate', function(event, data){
        // data represents properties of activated text
    }));



### 3.2 Change Styles

To update the style of the active text layer call change_style on it:

    MyImageInstance.active_text.change_style(options);

##### options

All optional

- font-family
- font-size (px)
- line-height (px)
- font-weight
- font-style
- color
- text-align



### 3.3 Disable/enable text or sticker editing

Stop text or sticker elements being activates so that the user can edit the other
type unhindered.

    MyImageInstance.set_options({disable_text_edit: bool});
    MyImageInstance.set_options({disable_sticker_edit: bool});


### 3.4 Render Text While Working

It's

    MyImageInstance.set_options({render_text: bool});


### add text

Add a text layer.
options format matches text layers in filter json.

    MyImageInstance.add_text(options);



How to
------

Apply a filter

    MyImageInstance.apply_filter({filter: "slug"});


Preview with rext rendered when render_text = false

    MyImageInstance.apply_filter({render_text: true, editable:false});
