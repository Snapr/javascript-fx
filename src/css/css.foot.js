';

var htmlDiv = document.createElement('div');
htmlDiv.innerHTML = '<p>x</p><style>' + css + '</style>';
document.getElementsByTagName('head')[0].appendChild(htmlDiv.childNodes[1]);
