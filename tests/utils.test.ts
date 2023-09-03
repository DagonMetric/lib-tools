import * as assert from 'node:assert';
import * as path from 'node:path';

import { describe, it } from 'node:test';

import {
    isInFolder,
    isSamePaths,
    isWindowsStyleAbsolute,
    normalizePathToPOSIXStyle
} from '../src/utils/path-helpers.js';

void describe('node:path', () => {
    void describe('normalize', () => {
        void it("normalize '\\'", () => {
            assert.equal(path.posix.normalize('\\'), '\\');
            assert.equal(path.win32.normalize('\\'), '\\');
        });

        void it("normalize '\\\\'", () => {
            assert.equal(path.posix.normalize('\\\\'), '\\\\');
            assert.equal(path.win32.normalize('\\\\'), '\\');
        });

        void it("normalize 'foo\\\\bar\\'", () => {
            assert.equal(path.posix.normalize('foo\\\\bar\\'), 'foo\\\\bar\\');
            assert.equal(path.win32.normalize('foo\\\\bar\\'), 'foo\\bar\\');
        });

        void it("normalize '\\\\server'", () => {
            assert.equal(path.posix.normalize('\\\\server'), '\\\\server');
            // ** TO NOTE **
            assert.equal(path.win32.normalize('\\\\server'), '\\server');
        });

        void it("normalize '//server'", () => {
            // ** TO NOTE **
            assert.equal(path.posix.normalize('//server'), '/server');
            // ** TO NOTE **
            assert.equal(path.win32.normalize('//server'), '\\server');
        });

        void it("normalize '////server'", () => {
            // ** TO NOTE **
            assert.equal(path.posix.normalize('////server'), '/server');
            // ** TO NOTE **
            assert.equal(path.win32.normalize('////server'), '\\server');
        });

        void it("normalize 'C:\\'", () => {
            assert.equal(path.posix.normalize('C:\\'), 'C:\\');
            assert.equal(path.win32.normalize('C:\\'), 'C:\\');
        });

        void it("normalize 'C:\\\\'", () => {
            assert.equal(path.posix.normalize('C:\\\\'), 'C:\\\\');
            // ** TO NOTE **
            assert.equal(path.win32.normalize('C:\\\\'), 'C:\\');
        });

        void it("normalize 'C:'", () => {
            assert.equal(path.posix.normalize('C:'), 'C:');
            // ** TO NOTE **
            assert.equal(path.win32.normalize('C:'), 'C:.');
        });

        void it("normalize 'C://'", () => {
            assert.equal(path.posix.normalize('C://'), 'C:/');
            assert.equal(path.win32.normalize('C://'), 'C:\\');
        });

        void it("normalize 'C:////'", () => {
            assert.equal(path.posix.normalize('C:////'), 'C:/');
            assert.equal(path.win32.normalize('C:////'), 'C:\\');
        });

        void it("normalize '/'", () => {
            assert.equal(path.posix.normalize('/'), '/');
            assert.equal(path.win32.normalize('/'), '\\');
        });

        void it("normalize '.'", () => {
            assert.equal(path.posix.normalize('.'), '.');
            assert.equal(path.win32.normalize('.'), '.');
        });

        void it("normalize './'", () => {
            assert.equal(path.posix.normalize('./'), './');
            assert.equal(path.win32.normalize('./'), '.\\');
        });
    });

    void describe('isAbsolute', () => {
        void it("isAbsolute '.'", () => {
            assert.equal(path.posix.isAbsolute('.'), false);
            assert.equal(path.win32.isAbsolute('.'), false);
        });

        void it("isAbsolute '/'", () => {
            assert.equal(path.posix.isAbsolute('/'), true);
            assert.equal(path.win32.isAbsolute('/'), true);
        });

        void it("isAbsolute '//'", () => {
            assert.equal(path.posix.isAbsolute('//'), true);
            assert.equal(path.win32.isAbsolute('//'), true);
        });

        void it("isAbsolute '//server'", () => {
            assert.equal(path.posix.isAbsolute('//server'), true);
            assert.equal(path.win32.isAbsolute('//server'), true);
        });

        void it("isAbsolute '\\\\server'", () => {
            // ** TO NOTE **
            assert.equal(path.posix.isAbsolute('\\\\server'), false);
            assert.equal(path.win32.isAbsolute('\\\\server'), true);
        });

        void it("isAbsolute 'C:'", () => {
            // ** TO NOTE **
            assert.equal(path.posix.isAbsolute('C:'), false);
            // ** TO NOTE **
            assert.equal(path.win32.isAbsolute('C:'), false);
        });

        void it("isAbsolute 'C://'", () => {
            // ** TO NOTE **
            assert.equal(path.posix.isAbsolute('C://'), false);
            assert.equal(path.win32.isAbsolute('C://'), true);
        });

        void it("isAbsolute 'C:/'", () => {
            // ** TO NOTE **
            assert.equal(path.posix.isAbsolute('C:/'), false);
            assert.equal(path.win32.isAbsolute('C:/'), true);
        });

        void it("isAbsolute 'C:\\'", () => {
            // ** TO NOTE **
            assert.equal(path.posix.isAbsolute('C:\\'), false);
            assert.equal(path.win32.isAbsolute('C:\\'), true);
        });

        void it("isAbsolute 'http://example.com'", () => {
            assert.equal(path.posix.isAbsolute('http://example.com'), false);
            assert.equal(path.win32.isAbsolute('http://example.com'), false);
        });

        void it("isAbsolute 'file:///opt'", () => {
            assert.equal(path.posix.isAbsolute('file:///opt'), false);
            assert.equal(path.win32.isAbsolute('file:///opt'), false);
        });
    });

    void describe('relative', () => {
        void it("relative 'foo//bar'", () => {
            assert.equal(path.posix.relative('', 'foo//bar'), 'foo/bar');
            assert.equal(path.win32.relative('', 'foo//bar'), 'foo\\bar');
        });

        void it("relative 'foo////bar'", () => {
            assert.equal(path.posix.relative('', 'foo////bar'), 'foo/bar');
            assert.equal(path.win32.relative('', 'foo////bar'), 'foo\\bar');
        });

        void it("relative 'foo/bar' = 'foo//bar'", () => {
            assert.equal(path.posix.relative('foo/bar', 'foo//bar'), '');
            assert.equal(path.win32.relative('foo/bar', 'foo//bar'), '');
        });

        void it("relative 'c:/a///b' = 'c:/a/b'", () => {
            assert.equal(path.posix.relative('c:/a///b', 'c:/a/b'), '');
            assert.equal(path.win32.relative('c:/a///b', 'c:/a/b'), '');
        });

        void it("relative 'C:/A///B' = 'c:/a/b'", () => {
            // ** TO NOTE **
            assert.equal(path.posix.relative('C:/A///B'.toLowerCase(), 'c:/a/b'), '');
            assert.equal(path.win32.relative('C:/A///B', 'c:/a/b'), '');
        });

        void it("relative '//server//path-1' = '//server/path-1'", () => {
            assert.equal(path.posix.relative('//server//path-1', '//server/path-1'), '');
            assert.equal(path.win32.relative('//server//path-1', '//server/path-1'), '');
        });
    });

    void describe('resolve', () => {
        void it("resolve 'C:/'", () => {
            assert.equal(path.win32.resolve('C:/'), 'C:\\');
        });

        void it("resolve 'C:\\'", () => {
            assert.equal(path.win32.resolve('C:\\'), 'C:\\');
        });

        void it("resolve '\\\\server\\public'", () => {
            // ** TO NOTE
            assert.equal(path.win32.resolve('\\\\server\\public'), '\\\\server\\public\\');
            // ** TO NOTE
            // /Users/Current Working Directory/\\\\server\\public
            // assert.equal(path.posix.resolve('\\\\server\\public'), '\\\\server\\public\\');
        });

        void it("resolve '//server/public'", () => {
            // ** TO NOTE
            assert.equal(path.win32.resolve('//server/public'), '\\\\server\\public\\');
            // ** TO NOTE
            assert.equal(path.posix.resolve('//server/public'), '/server/public');
        });

        // ** TO NOTE - Different result on different OS **
        // On Ubuntu - 'C:\\\\home\\\\runner\\\\work\\\\lib-tools\\\\lib-tools'
        // void it("resolve 'C:'", () => {
        //     assert.equal(path.win32.resolve('C:'), process.cwd());
        // });

        // ** TO NOTE - Different result on different OS **
        // On Ubuntu - '\\\\'
        // void it("resolve '/'", () => {
        //     assert.equal(path.win32.resolve('/'), path.win32.parse(process.cwd()).root);
        // });

        // ** TO NOTE - Different result on different OS **
        // On Ubuntu - '\\\\home\\\\runner\\\\work\\\\lib-tools\\\\lib-tools'
        // void it("resolve './'", () => {
        //     assert.equal(path.win32.resolve('./'), process.cwd());
        // });
    });

    void describe('dirname', () => {
        void it("dirname 'C:/'", () => {
            // ** TO NOTE **
            assert.equal(path.posix.dirname('C:/'), '.');
            assert.equal(path.win32.dirname('C:/'), 'C:/');
        });

        void it("dirname 'C:/abc'", () => {
            assert.equal(path.posix.dirname('C:/abc'), 'C:');
            assert.equal(path.win32.dirname('C:/abc'), 'C:/');
        });

        void it("dirname '/abc'", () => {
            assert.equal(path.posix.dirname('/abc'), '/');
            assert.equal(path.win32.dirname('/abc'), '/');
        });
    });
});

void describe('Utils', () => {
    void describe('normalizePathToPOSIXStyle', () => {
        void it("should be 'C:' -> 'C:/'", () => {
            assert.equal(normalizePathToPOSIXStyle('C:'), 'C:/');
        });

        void it("should be 'C:.' -> 'C:.'", () => {
            assert.equal(normalizePathToPOSIXStyle('C:.'), 'C:.');
        });

        void it("should be 'C:tmp.txt' -> 'C:tmp.txt'", () => {
            assert.equal(normalizePathToPOSIXStyle('C:tmp.txt'), 'C:tmp.txt');
        });

        void it("should be 'C:\\' -> 'C:/'", () => {
            assert.equal(normalizePathToPOSIXStyle('C:\\'), 'C:/');
        });

        void it("should be 'C:\\\\' -> 'C:/'", () => {
            assert.equal(normalizePathToPOSIXStyle('C:\\\\'), 'C:/');
        });

        void it("should be 'C://' -> 'C:/'", () => {
            assert.equal(normalizePathToPOSIXStyle('C://'), 'C:/');
        });

        void it("should be '\\server' -> 'server'", () => {
            assert.equal(normalizePathToPOSIXStyle('\\server'), 'server');
        });

        void it("should be '\\\\server' -> '//server'", () => {
            assert.equal(normalizePathToPOSIXStyle('\\\\server'), '//server');
        });

        void it("should be '\\\\\\server' -> '///server'", () => {
            assert.equal(normalizePathToPOSIXStyle('\\\\\\server'), '///server');
        });

        // void it("should be '//server' -> '//server'", () => {
        //     assert.equal(normalizePathToPOSIXStyle('//server'), '//server');
        // });

        void it("should be '.\\' -> ''", () => {
            assert.equal(normalizePathToPOSIXStyle('.\\'), '');
        });

        void it("should be '\\' -> ''", () => {
            assert.equal(normalizePathToPOSIXStyle('\\'), '');
        });

        void it("should be './' -> ''", () => {
            assert.equal(normalizePathToPOSIXStyle('./'), '');
        });

        void it("should be '/' -> ''", () => {
            assert.equal(normalizePathToPOSIXStyle('/'), '');
        });

        void it("should be '.' -> ''", () => {
            assert.equal(normalizePathToPOSIXStyle('.'), '');
        });

        void it("should be './path-1' -> 'path-1'", () => {
            assert.equal(normalizePathToPOSIXStyle('./path-1'), 'path-1');
        });

        void it("should be 'path-1/./path-2' -> 'path-1/path-2'", () => {
            assert.equal(normalizePathToPOSIXStyle('path-1/./path-2'), 'path-1/path-2');
        });

        void it("should be 'path-1/.' -> 'path-1'", () => {
            assert.equal(normalizePathToPOSIXStyle('path-1/.'), 'path-1');
        });

        void it("should be 'path-1/(a_p.a,t `~h)-2!@#$%^&=+[]{};'/../' -> 'path-1'", () => {
            assert.equal(normalizePathToPOSIXStyle("path-1/(a_p.a,t `~h)-2!@#$%^&=+[]{};'/../"), 'path-1');
        });
    });

    void describe('isWindowsStyleAbsolute', () => {
        void it("should be false '.'", () => {
            assert.equal(isWindowsStyleAbsolute('.'), false);
        });

        void it("should be false '/'", () => {
            assert.equal(isWindowsStyleAbsolute('/'), false);
        });

        void it("should be false './'", () => {
            assert.equal(isWindowsStyleAbsolute('./'), false);
        });

        void it("should be false ''", () => {
            assert.equal(isWindowsStyleAbsolute(''), false);
        });

        void it("should be true '\\\\server'", () => {
            assert.equal(isWindowsStyleAbsolute('\\\\server'), true);
        });

        void it("should be false '\\server'", () => {
            assert.equal(isWindowsStyleAbsolute('\\server'), false);
        });

        // void it("should be true '//server'", () => {
        //     assert.equal(isWindowsStyleAbsolute('//server'), true);
        // });

        void it("should be false '/server'", () => {
            assert.equal(isWindowsStyleAbsolute('/server'), false);
        });

        void it("should be false 'foo/bar'", () => {
            assert.equal(isWindowsStyleAbsolute('foo/bar'), false);
        });

        void it("should be true 'C:\\'", () => {
            assert.equal(isWindowsStyleAbsolute('C:\\'), true);
        });

        void it("should be true 'C://'", () => {
            assert.equal(isWindowsStyleAbsolute('C://'), true);
        });

        void it("should be true 'C:/'", () => {
            assert.equal(isWindowsStyleAbsolute('C:/'), true);
        });

        void it("should be true 'C:'", () => {
            assert.equal(isWindowsStyleAbsolute('C:'), true);
        });

        void it("should be false 'C:.'", () => {
            assert.equal(isWindowsStyleAbsolute('C:.'), false);
        });
    });

    void describe('isSamePaths', () => {
        void it(`should be same path: 'C:\\' and 'C:/'`, () => {
            assert.equal(isSamePaths('C:\\', 'C:/'), true);
        });

        void it(`should be same path: 'C:\\\\' and 'C:/'`, () => {
            assert.equal(isSamePaths('C:\\\\', 'C:/'), true);
        });

        void it(`should be same path: 'C:' and 'C:/'`, () => {
            assert.equal(isSamePaths('C:', 'C:/'), true);
        });

        void it(`should be same path: 'c:' and 'C:/'`, () => {
            assert.equal(isSamePaths('c:', 'C:/', true), true);
        });

        void it(`should be same path: 'foo\\\\bar\\baz' and 'foo/bar/baz'`, () => {
            assert.equal(isSamePaths('foo\\\\bar\\baz', 'foo/bar/baz'), true);
        });
    });

    void describe('isInFolder', () => {
        void it(`should be 'C:/abc/def' in 'C:/abc'  folder`, () => {
            assert.equal(isInFolder('C:/abc', 'C:/abc/def'), true);
        });

        void it(`should be 'C:/ABC/def' in 'C:/abc'  folder`, () => {
            assert.equal(isInFolder('C:/abc', 'C:/ABC/def', true), true);
        });

        void it(`should be '//server/abc/def' in '//server/abc'  folder`, () => {
            assert.equal(isInFolder('//server/abc', '//server/abc/def'), true);
        });

        void it(`should be 'foo/bar' in 'foo'  folder`, () => {
            assert.equal(isInFolder('foo', 'foo/bar'), true);
        });

        void it(`should be '/foo/bar' in '/foo'  folder`, () => {
            assert.equal(isInFolder('/foo', '/foo/bar'), true);
        });

        void it(`should be '/foo//' in '/'  folder`, () => {
            assert.equal(isInFolder('/', '/foo//'), true);
        });

        void it(`should not be '/' in '/foo/bar'  folder`, () => {
            assert.equal(isInFolder('/foo/bar', '/'), false);
        });

        void it(`should not be 'c:/' in 'c:/foo/bar'  folder`, () => {
            assert.equal(isInFolder('c:/foo/bar', 'c:/'), false);
        });
    });
});
