import * as assert from 'node:assert';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import {
    findUp,
    getAbsolutePathInfoes,
    isDirInDir,
    isSamePath,
    isWindowsStyleAbsolute,
    normalizePathToPOSIXStyle,
    pathExists
} from '../src/utils/path-helpers.js';

void describe('utils/path-helpers', () => {
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

        void it("should be '/server' -> 'server'", () => {
            assert.equal(normalizePathToPOSIXStyle('/server'), 'server');
        });

        void it("should be '//server' -> '//server'", () => {
            assert.equal(normalizePathToPOSIXStyle('//server'), '//server');
        });

        void it("should be '////server/public' -> '//server'", () => {
            assert.equal(normalizePathToPOSIXStyle('////server/public'), '////server/public');
        });

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

        void it("should be true '//server'", () => {
            assert.equal(isWindowsStyleAbsolute('//server'), true);
        });

        void it("should be true '//server/public'", () => {
            assert.equal(isWindowsStyleAbsolute('//server/public'), true);
        });

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

    void describe('isSamePath', () => {
        void it(`should be same path: 'C:\\' and 'C:/'`, () => {
            assert.equal(isSamePath('C:\\', 'C:/'), true);
        });

        void it(`should be same path: 'C:\\\\' and 'C:/'`, () => {
            assert.equal(isSamePath('C:\\\\', 'C:/'), true);
        });

        void it(`should be same path: 'C:' and 'C:/'`, () => {
            assert.equal(isSamePath('C:', 'C:/'), true);
        });

        void it(`should be same path: 'c:' and 'C:/'`, () => {
            assert.equal(isSamePath('c:', 'C:/', true), true);
        });

        void it(`should be same path: 'foo\\\\bar\\baz' and 'foo/bar/baz'`, () => {
            assert.equal(isSamePath('foo\\\\bar\\baz', 'foo/bar/baz'), true);
        });
    });

    void describe('isDirInDir', () => {
        void it(`should be 'C:/abc/def' in 'C:/abc'  folder`, () => {
            assert.equal(isDirInDir('C:/abc', 'C:/abc/def'), true);
        });

        void it(`should be 'C:/ABC/def' in 'C:/abc'  folder`, () => {
            assert.equal(isDirInDir('C:/abc', 'C:/ABC/def', true), true);
        });

        void it(`should be '//server/abc/def' in '//server/abc'  folder`, () => {
            assert.equal(isDirInDir('//server/abc', '//server/abc/def'), true);
        });

        void it(`should be 'foo/bar' in 'foo'  folder`, () => {
            assert.equal(isDirInDir('foo', 'foo/bar'), true);
        });

        void it(`should be '/foo/bar' in '/foo'  folder`, () => {
            assert.equal(isDirInDir('/foo', '/foo/bar'), true);
        });

        void it(`should be '/foo//' in '/'  folder`, () => {
            assert.equal(isDirInDir('/', '/foo//'), true);
        });

        void it(`should not be '/' in '/foo/bar'  folder`, () => {
            assert.equal(isDirInDir('/foo/bar', '/'), false);
        });

        void it(`should not be 'c:/' in 'c:/foo/bar'  folder`, () => {
            assert.equal(isDirInDir('c:/foo/bar', 'c:/'), false);
        });
    });

    void describe('pathExists', () => {
        void it(`should exist 'libconfig.json'`, async () => {
            const existed = await pathExists(path.resolve(process.cwd(), 'libconfig.json'));
            assert.equal(existed, true);
        });
    });

    void describe('findUp', () => {
        void it(`should find 'libconfig.json' in current working directory`, async () => {
            const foundFilePath = await findUp('libconfig.json', path.resolve(process.cwd(), 'dist'), process.cwd());
            assert.ok(foundFilePath);
            assert.match(foundFilePath, /(\\|\/)libconfig.json$/);
        });
    });

    void describe('getAbsolutePathInfoes', () => {
        void it(`should find 'libconfig.json' in current working directory`, async () => {
            const pathInfoes = await getAbsolutePathInfoes(['libconfig.json'], process.cwd());

            assert.strictEqual(pathInfoes.length, 1);
            assert.strictEqual(pathInfoes[0].path, path.resolve(process.cwd(), 'libconfig.json'));
            assert.strictEqual(pathInfoes[0].isFile, true);
            assert.strictEqual(pathInfoes[0].isDirectory, false);
            assert.strictEqual(pathInfoes[0].isSystemRoot, false);
            assert.strictEqual(pathInfoes[0].isSymbolicLink, false);
        });
    });
});
