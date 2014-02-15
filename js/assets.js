/*******************************************************************************

    httpswitchboard - a Chromium browser extension to black/white list requests.
    Copyright (C) 2013  Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/httpswitchboard
*/

/*******************************************************************************

Assets
    Read:
        If in cache
            Use cache
        If not in cache
            Use local
    Update:
        Use remote
        Save in cache

    Import:
        Use textarea
        Save in cache [user directory]

File system structure:
    assets
        httpsb
            ...
        thirdparties
            ...
        user
            blacklisted-hosts.txt
                ...
*/

/******************************************************************************/

(function() {

/******************************************************************************/

var fileSystem;
var remoteRoot = 'https://raw2.github.com/gorhill/httpswitchboard/master/';

/******************************************************************************/

var getTextFileFromURL = function(url, onLoad, onError) {
    var xhr = new XMLHttpRequest();
    xhr.responseType = 'text';
    xhr.onload = onLoad;
    xhr.onerror = onError;
    xhr.ontimeout = onError;
    xhr.open('get', url, true);
    xhr.send();
};

/******************************************************************************/

// Useful to avoid having to manage a directory tree

var cachePathFromPath = function(path) {
    return path.replace(/\//g, '___');
};

/******************************************************************************/

var readLocalFile = function(path, msg) {
    var onLocalFileLoaded = function() {
        console.log('HTTP Switchboard> onLocalFileLoaded()');
        chrome.runtime.sendMessage({
            'what': msg,
            'path': path,
            'content': this.responseText
        });
        this.onload = this.onerror = null;
    };

    var onLocalFileError = function(err) {
        console.log('HTTP Switchboard> onLocalFileError("%s"):', path, err.message);
        chrome.runtime.sendMessage({
            'what': msg,
            'path': path,
            'content': '',
            'error': err
        });
        this.onload = this.onerror = null;
    };

    var onCacheFileLoaded = function() {
        console.log('HTTP Switchboard> onCacheFileLoaded()');
        chrome.runtime.sendMessage({
            'what': msg,
            'path': path,
            'content': this.responseText
        });
        this.onload = this.onerror = null;
    };

    var onCacheFileError = function(err) {
        console.log('HTTP Switchboard> onCacheFileError("%s"):', path, err.message);
        getTextFileFromURL(chrome.runtime.getURL(path), onLocalFileLoaded);
        this.onload = this.onerror = null;
    };

    var onCacheEntryFound = function(file) {
        console.log('HTTP Switchboard> onCacheEntryFound():', file.toURL());
        getTextFileFromURL(file.toURL(), onCacheFileLoaded, onCacheFileError);
    };

    var onCacheEntryError = function(err) {
        console.log('HTTP Switchboard> onCacheEntryError("%s"):', path, err.message);
        getTextFileFromURL(chrome.runtime.getURL(path), onLocalFileLoaded);
    };

    // From cache?
    if ( fileSystem ) {
        fileSystem.root.getFile(cachePathFromPath(path), null, onCacheEntryFound, onCacheEntryError);
        return;
    }

    // From built-in local directory
    getTextFileFromURL(chrome.runtime.getURL(path), onLocalFileLoaded, onLocalFileError);
};

/******************************************************************************/

var updateFromRemote = function(path, msg) {
    var remoteURL = remoteRoot + path;
    var remoteContent = '';

    var onFileWriteSuccess = function(fwriter) {
        console.log('HTTP Switchboard> onFileWriteSuccess("%s")', path);
        chrome.runtime.sendMessage({
            'what': msg,
            'path': path
        });
    };

    var onFileWriteError = function(err) {
        console.log('HTTP Switchboard> onFileWriteError("%s"):', path, err.message);
        chrome.runtime.sendMessage({
            'what': msg,
            'path': path,
            'error': err
        });
    };

    var onCreateFileWriterSuccess = function(fwriter) {
        fwriter.onwriteend = onFileWriteSuccess;
        fwriter.onerror = onFileWriteError;
        var blob = new Blob([remoteContent], { type: 'text/plain' });
        fwriter.write(blob);
    };

    var onCreateFileWriterError = function(err) {
        console.log('HTTP Switchboard> onCreateFileWriterError("%s"):', path, err.message);
        chrome.runtime.sendMessage({
            'what': msg,
            'path': path,
            'error': err
        });
    };

    var onCacheEntryFound = function(file) {
        console.log('HTTP Switchboard> onCacheEntryFound():', file.toURL());
        file.createWriter(onCreateFileWriterSuccess, onCreateFileWriterError);
    };

    var onCacheEntryError = function(err) {
        console.log('HTTP Switchboard> onCacheEntryError("%s"):', path, err.message);
        chrome.runtime.sendMessage({
            'what': msg,
            'path': path,
            'error': err
        });
    };

    var onRemoteFileLoaded = function() {
        console.log('HTTP Switchboard> onRemoteFileLoaded()');
        if ( this.responseText && this.responseText.length ) {
            remoteContent = this.responseText;
            fileSystem.root.getFile(cachePathFromPath(path), { create: true }, onCacheEntryFound, onCacheEntryError);
        }
        this.onload = this.onerror = null;
    };

    var onRemoteFileError = function(err) {
        console.log('HTTP Switchboard> onRemoteFileError("%s"):', remoteURL, err.message);
        this.onload = this.onerror = null;
        chrome.runtime.sendMessage({
            'what': msg,
            'path': path,
            'error': err
        });
    };

    if ( fileSystem ) {
        getTextFileFromURL(remoteURL, onRemoteFileLoaded, onRemoteFileError);
    }
};

/******************************************************************************/

// Ref.: http://www.html5rocks.com/en/tutorials/file/filesystem/

var onError = function() {
    console.error('HTTP Switchboard> Could not get virtual file system');
};

var onRequestFileSystem = function(fs) {
    fileSystem = fs;
};

var onRequestQuota = function(grantedBytes) {
    window.webkitRequestFileSystem(window.PERSISTENT, grantedBytes, onRequestFileSystem, onError);
};

navigator.webkitPersistentStorage.requestQuota(16*1024*1024, onRequestQuota, onError);

/******************************************************************************/

// Export API

HTTPSB.assets = {
    'get': readLocalFile,
    'update': updateFromRemote
};

/******************************************************************************/

})();

