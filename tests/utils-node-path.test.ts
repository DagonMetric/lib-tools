import * as assert from 'node:assert';
import * as path from 'node:path';
import { describe, it } from 'node:test';

void describe('utils/node:path', () => {
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

        // void it("resolve '\\\\server'", () => {
        //     // ** TO NOTE
        //     // C:\\server
        //     assert.equal(path.win32.resolve('\\\\server'), '\\\\server');
        // });

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

    void describe('parse', () => {
        void it("parse 'C:/' root", () => {
            // ** TO NOTE **
            assert.equal(path.posix.parse('C:/').root, '');
            // ** TO NOTE **
            assert.equal(path.win32.parse('C:/').root, 'C:/');
        });

        void it("parse 'C://' root", () => {
            // ** TO NOTE **
            assert.equal(path.posix.parse('C://').root, '');
            // ** TO NOTE **
            assert.equal(path.win32.parse('C://').root, 'C:/');
        });

        void it("parse 'C:\\' root", () => {
            // ** TO NOTE **
            assert.equal(path.posix.parse('C:\\').root, '');
            // ** TO NOTE **
            assert.equal(path.win32.parse('C:\\').root, 'C:\\');
        });

        void it("parse 'C:' root", () => {
            // ** TO NOTE **
            assert.equal(path.posix.parse('C:').root, '');
            // ** TO NOTE **
            assert.equal(path.win32.parse('C:').root, 'C:');
        });

        void it("parse '//server' root", () => {
            // ** TO NOTE **
            assert.equal(path.posix.parse('//server').root, '/');
            // ** TO NOTE **
            assert.equal(path.win32.parse('//server').root, '/');
        });

        void it("parse '//server//public' root", () => {
            // ** TO NOTE **
            assert.equal(path.posix.parse('//server//public').root, '/');
            // ** TO NOTE **
            assert.equal(path.win32.parse('//server//public').root, '//server//public');
        });

        void it("parse '//server//public/path-1' root", () => {
            // ** TO NOTE **
            assert.equal(path.posix.parse('//server//public/path-1').root, '/');
            // ** TO NOTE **
            assert.equal(path.win32.parse('//server//public/path-1').root, '//server//public/');
        });

        void it("parse '\\server' root", () => {
            // ** TO NOTE **
            assert.equal(path.posix.parse('\\server').root, '');
            // ** TO NOTE **
            assert.equal(path.win32.parse('\\server').root, '\\');
        });

        void it("parse '\\\\server' root", () => {
            // ** TO NOTE **
            assert.equal(path.posix.parse('\\\\server').root, '');
            // ** TO NOTE **
            assert.equal(path.win32.parse('\\\\server').root, '\\');
        });

        void it("parse '\\\\server\\public' root", () => {
            // ** TO NOTE **
            assert.equal(path.posix.parse('\\\\server\\public').root, '');
            // ** TO NOTE **
            assert.equal(path.win32.parse('\\\\server\\public').root, '\\\\server\\public');
        });

        void it("parse '/foo/bar' root", () => {
            // ** TO NOTE **
            assert.equal(path.posix.parse('/foo/bar').root, '/');
            // ** TO NOTE **
            assert.equal(path.win32.parse('/foo/bar').root, '/');
        });

        void it("parse 'foo/bar' root", () => {
            // ** TO NOTE **
            assert.equal(path.posix.parse('foo/bar').root, '');
            // ** TO NOTE **
            assert.equal(path.win32.parse('foo/bar').root, '');
        });

        void it("parse '/' root", () => {
            // ** TO NOTE **
            assert.equal(path.posix.parse('/').root, '/');
            // ** TO NOTE **
            assert.equal(path.win32.parse('/').root, '/');
        });
    });
});
