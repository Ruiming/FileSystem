import fs from 'fs'
import path from 'path'
import {remote} from 'electron'
import wmic from 'node-wmic'
import childProcess from 'child_process'

(function() {
    'use strict';

    angular
        .module('app')
        .controller('FileCtrl', FileCtrl);

    FileCtrl.$inject = ['$scope', 'FileService', '$timeout', 'diskdrive', 'disks', '$q', '$interval', 'icon'];

    function FileCtrl($scope, FileService, $timeout, diskdrive, disks, $q, $interval, icon) {
        var Menu = remote.Menu,
            MenuItem = remote.MenuItem,
            result = [],
            length = 0;
        var worker = null;

        $scope.path = "Computer";
        $scope.files = [];
        $scope.backwardStore = ["Computer"];         // 供后退用
        $scope.forwardStore = [];                    // 供前进用
        $scope.col = 'Name';
        $scope.desc = 0;
        $scope.disks = [];
        $scope.disk = {};
        $scope.diskdrive = diskdrive;
        $scope.last = false;
        $scope.show = false;
        $scope.disks = disks;
        $scope.icon = icon;
        $scope.searching = false;                       // 判断当前搜索状态
        $scope.searchPage = false;                      // 判断是否停留在搜索页面
        $scope.options = {
            caps: false,
            fileOnly: false,
            folderOnly: false
        };

        $scope.search = search;
        $scope.listenEnter = listenEnter;
        $scope.select = select;
        $scope.selectDisk = selectDisk;
        $scope.rename = rename;
        $scope.forward = forward;
        $scope.forward_folder = forward_folder;
        $scope.turnto = turnto;
        $scope.home = home;
        $scope.breadcrumb = breadcrumb;
        $scope.Hbackward = Hbackward;
        $scope.Hforward = Hforward;
        $scope.lazyload = lazyload;
        $scope.showSearchOption = () => $scope.show = true;
        $scope.hideSearchOption = () => $scope.show = false;

        breadcrumb();

        let rightClickPosition = null;
        const menu1 = new Menu();
        const menu2 = new Menu();

        /** 右键菜单 */
        let copy = new MenuItem({
            label: '复制',
            accelerator: 'CmdOrCtrl+C',
            click() {
                let selectedElement = document.elementFromPoint(rightClickPosition.x, rightClickPosition.y).parentNode;
                let id = JSON.parse(selectedElement.attributes.id.nodeValue);
                $scope.src = $scope.files[id].path;                                 // 路径
                $scope.srcType = $scope.files[id].type !== '文件夹';                 // 文件类别
                $scope.srcName = $scope.files[id].name;                             // 文件名称
            }
        }), pasteIn = new MenuItem({
            label: '粘贴到里面',
            accelerator: 'CmdOrCtrl+V',
            click() {
                let selectedElement = document.elementFromPoint(rightClickPosition.x, rightClickPosition.y).parentNode;
                let id = JSON.parse(selectedElement.attributes.id.nodeValue);
                $scope.dist = $scope.path + $scope.files[id].name;
                $scope.srcType ? FileService.copyFile($scope.src, $scope.dist + "\\\\" + $scope.srcName).then(() => {cut()})
                    : FileService.copyFolder($scope.src, $scope.dist + "\\\\" + $scope.srcName).then(() => {cut()});
            }
        }), pasteHere = new MenuItem({
            label: '粘贴到此处',
            accelerator: 'CmdOrCtrl+V',
            click() {
                if(!$scope.srcType) {
                    FileService.copyFolder($scope.src, $scope.path + $scope.srcName).then(result => {
                        for (let file of $scope.files) {
                            if(file.name === result.name) {
                                file = result;
                                return 1;
                            }
                        }
                        return result;
                    }).then(re => {
                        if(re !== 1) {
                            $scope.files.push(re);
                            result.splice($scope.files.length + 1, 0, re);
                            $scope.length = result.length;
                        }
                    }).then(() => {cut()});
                } else {
                    FileService.copyFile($scope.src, $scope.path + $scope.srcName).then(result => {
                        for(let file of $scope.files) {
                            if(file.name === result.name) {
                                file = result;
                                return 1;
                            }
                        }
                        return result;
                    }).then(re => {
                        if(re !== 1) {
                            $scope.files.push(re);
                            result.splice($scope.files.length + 1, 0, re);
                            $scope.length = result.length;
                        }
                    }).then(() => {cut()});
                }
            }
        }), newFile = new MenuItem({
            label: '新建',
            accelerator: 'CmdOrCtrl+N',
            submenu: [{
                label: '文件夹',
                click() {
                    FileService.createNewFolder($scope.path).then(stat => {
                        $scope.files.push(stat);
                        result.splice($scope.files.length + 1, 0, stat);
                        $scope.length = result.length;
                    });
                }
            }, {
                label: '文件',
                click() {
                    FileService.createNewTxt($scope.path).then(stat => {
                        $scope.files.push(stat);
                        result.splice($scope.files.length + 1, 0, stat);
                        $scope.length = result.length;
                    })
                }
            }
            ]
        }), renameFile = new MenuItem({
            'label': '重命名',
            accelerator: 'CmdOrCtrl+R',
            click() {
                let selectedElement = document.elementFromPoint(rightClickPosition.x, rightClickPosition.y).parentNode;
                let id = JSON.parse(selectedElement.attributes.id.nodeValue);
                $scope.files[id].rename = true;
                $scope.files[id].hover = false;
                $scope.select(id);
                $scope.src = $scope.path + $scope.files[id].name;                   // 路径
                $scope.name = $scope.files[id].name;
            }
        }), deleteFile = new MenuItem({
            label: '删除',
            accelerator: 'CmdOrCtrl+D',
            click() {
                let selectedElement = document.elementFromPoint(rightClickPosition.x, rightClickPosition.y).parentNode;
                let id = JSON.parse(selectedElement.attributes.id.nodeValue);
                let src = $scope.path + $scope.files[id].name;
                if($scope.files[id].type !== '文件夹') {
                    FileService.deleteFile($scope.files[id].path, true).then(() => {
                        $scope.files.splice($scope.files.indexOf($scope.files[id]), 1);
                        result.splice($scope.files.indexOf($scope.files[id]), 1);
                        $scope.length = result.length;
                    })
                } else {
                    FileService.deleteFolder($scope.files[id].path, true).then(() => {
                        $scope.files.splice($scope.files.indexOf($scope.files[id]), 1);
                        result.splice($scope.files.indexOf($scope.files[id]), 1);
                        $scope.length = result.length;
                    })
                }
                if(path === $scope.forwardStore[$scope.forwardStore.length-1] || path + "\\\\" === $scope.forwardStore[$scope.forwardStore.length-1]) {
                    $scope.forwardStore = [];
                }
            }
        }), cutFile = new MenuItem({
            label: '剪切',
            accelerator: 'CmdOrCtrl+X',
            click() {
                let selectedElement = document.elementFromPoint(rightClickPosition.x, rightClickPosition.y).parentNode;
                let id = JSON.parse(selectedElement.attributes.id.nodeValue);
                $scope.src = $scope.files[id].path;                                 // 路径
                $scope.srcType = $scope.files[id].type !== '文件夹';                 // 文件类别
                $scope.srcName = $scope.files[id].name;                             // 文件名称
                $scope.deletePath = $scope.files[id].path;                          // 剪切标志
                $scope.prePath = $scope.path;
                $scope.preId = id;
            }
        });
        menu1.append(copy);menu1.append(pasteIn);menu1.append(renameFile);menu1.append(deleteFile);menu1.append(cutFile);
        menu2.append(pasteHere);menu2.append(newFile);

        let FILE = document.getElementById('center');
        FILE.addEventListener('contextmenu', e => {
            e.preventDefault();
            rightClickPosition = {x: e.x, y: e.y};
            let selectedElement = document.elementFromPoint(rightClickPosition.x, rightClickPosition.y).parentNode;
            let id = selectedElement.attributes.id && +selectedElement.attributes.id.nodeValue;
            if(!$scope.searchPage && (isNaN(id) || !$scope.files[id].hover)) {
                menu2.items[0].enabled = ($scope.deletePath || $scope.src) && !$scope.searchPage;
                menu2.popup(remote.getCurrentWindow());
            } else if($scope.files[id]) {
                menu1.items[1].enabled = ($scope.deletePath || $scope.src) && !$scope.searchPage;
                if($scope.files[id].type !== '文件夹') menu1.items[1].enabled = false;
                menu1.popup(remote.getCurrentWindow());
            }
        }, false);

        /** 搜索 子进程 */
        function search(wanted) {
            if($scope.searching) {
                worker.kill();
                $scope.searching = false;
            } else {
                worker = childProcess.fork('./static/js/worker.js');
                // If use electron-packager, take attention to the worker.js file.
                // worker = childProcess.fork('./resources/worker.js');
                let data = {
                    src: $scope.path,
                    wanted: wanted,
                    caps: $scope.options.caps,
                    fileOnly: $scope.options.fileOnly,
                    folderOnly: $scope.options.folderOnly,
                    icon: icon
                };
                result = [];
                worker.on('message', data => {
                    if(data === 'over') {
                        console.log(data);
                        $scope.searching = false;
                    } else {
                        result.push(data);
                        console.log(data);
                        if(result.length > 30) {
                            $scope.files = result.slice(0, 30);
                        } else {
                            $scope.files = result.slice(0, result.length);
                        }
                        $scope.length = result.length;
                    }
                });
                worker.send(data);
                $scope.searchPage = true;
                $scope.searching = true;
            }
        }

        /** 监听Enter键 */
        function listenEnter(e, index) {
            if(e.which === 13) {
                $scope.rename(index);
            }
        }

        /** 点击文件或文件夹高亮 */
        function select(index) {
            let status = $scope.files[index].hover;
            $scope.files.forEach(file => {
                file.hover = false;
            });
            $scope.files[index].hover = !status;
            if($scope.files[index].hover) {
                getSideBar($scope.files[index].path);
            }
        }

        /** 点击磁盘高亮 */
        function selectDisk(index) {
            let status = $scope.disks[index].hover;
            $scope.disks.forEach(disk => {
                disk.hover = false;
            });
            $scope.disks[index].hover = !status;
            if($scope.disks[index].hover) {
                $scope.diskDetail = $scope.disks[index];
            }
        }

        /** 重命名 */
        function rename(index) {
            $scope.files[index].rename = false;
            $scope.dist = $scope.files[index].location + $scope.files[index].name;
            FileService.rename($scope.files[index].path, $scope.dist).then(stat => {
                console.log(stat.path);
                if($scope.src === $scope.files[index].path || $scope.deletePath === $scope.files[index].path) {
                    $scope.src = stat.path;
                    $scope.srcName = stat.name;
                    $scope.deletePath = stat.path;
                }
                $scope.files[index] = stat;
                result[index] = stat;
            }, err => {
                $scope.files[index].name = $scope.name;
            });
        }

        /** 跳转至相应磁盘 */
        function forward(x) {
            if(worker) {
                worker.kill();
                $scope.wanted = '';
                $scope.searching = false;
                $scope.searchPage = false;
            }
            if(x.Description == '光盘')   return;
            $scope.path = x.Name + "\\\\";
            $scope.backwardStore.push($scope.path);
            readFolder();
        }

        /** 跳转至相应文件夹 */
        function forward_folder(x) {
            if(x.type === '文件夹' || x.isDirectory()) {
                if(worker) {
                    worker.kill();
                    $scope.wanted = '';
                    $scope.searching = false;
                    $scope.searchPage = false;
                }
                $scope.path = x.path + '\\\\';
                $scope.backwardStore.push($scope.path);
                $scope.forwardStore = [];
                readFolder();
            } else {
                FileService.open(x.path);
            }
        }

        /** 导航栏跳转 */
        function turnto(x) {
            if(worker) {
                worker.kill();
                $scope.wanted = '';
                $scope.searching = false;
                $scope.searchPage = false;
            }
            let currentPath = $scope.path;
            if(x == "Computer" && currentPath != "Computer") {
                $scope.home();
                return;
            } else if(x == "Computer" && currentPath == "Computer") {
                return;
            }
            $scope.path = "";
            for(let i=0; i<$scope.breadcrumbs.length; i++) {
                if($scope.breadcrumbs[i] != x) {
                    $scope.path += $scope.breadcrumbs[i] + "\\\\";
                } else {
                    $scope.path += $scope.breadcrumbs[i] + "\\\\";
                    break;
                }
            }
            if(currentPath == $scope.path) {
                return;
            }
            $scope.backwardStore.push($scope.path);
            $scope.forwardStore = [];
            readFolder();
        }

        /** 跳到主页 */
        function home() {
            if(worker) {
                worker.kill();
                $scope.wanted = '';
                $scope.searching = false;
                $scope.searchPage = false;
            }
            $scope.path = "Computer";
            $scope.backwardStore.push($scope.path);
            $scope.files = [];
            getDisk();
        }

        /** 设置路径导航 */
        function breadcrumb() {
            if($scope.path == "Computer") {
                $scope.breadcrumbs = [];
            } else {
                $scope.breadcrumbs = $scope.path.split("\\\\");
            }
        }

        /** 后退 */
        function Hbackward() {
            if($scope.backwardStore == null || $scope.backwardStore.length == 1) {
                return;
            }
            if(worker) {
                worker.kill();
                $scope.wanted = '';
                $scope.searchPage = false;
                $scope.searching = false;
            }
            $scope.forwardStore.push($scope.path);
            $scope.backwardStore.pop();
            while($scope.backwardStore[$scope.backwardStore.length-1] != "Computer" &&!fs.existsSync($scope.backwardStore[$scope.backwardStore.length-1])) {
                $scope.backwardStore.pop();
            }
            $scope.path = $scope.backwardStore[$scope.backwardStore.length - 1];
            $scope.files = [];
            if($scope.path == "Computer") {
                $scope.filename = null;
                getDisk();
            } else {
                readFolder();
            }
        }

        /** 前进 */
        function Hforward() {
            if($scope.forwardStore == null || $scope.forwardStore.length < 1) {
                return;
            }
            if(worker) {
                worker.kill();
                $scope.wanted = '';
                $scope.searchPage = false;
                $scope.searching = false;
            }
            $scope.path = $scope.forwardStore[$scope.forwardStore.length - 1];
            $scope.backwardStore.push($scope.path);
            $scope.forwardStore.pop();
            if($scope.path == "Computer") {
                $scope.filename = null;
                getDisk();
            } else {
                readFolder();
            }
        }

        /** Lazrload 懒加载文件列表 */
        function lazyload() {
            if($scope.files.length < result.length) {
                let end = result.length - $scope.files.length > 30 ? $scope.files.length + 30 : result.length;
                for(let i=$scope.files.length; i<end; i++) {
                    $scope.files.push(result[i]);
                }
            }
        }

        /** 获取目录里面的文件列表并监控 */
        function readFolder() {
            if(worker) {
                worker.kill();
                $scope.wanted = '';
                $scope.searching = false;
                $scope.searchPage = false;
            }
            FileService.readFolder($scope.path).then(filenames => {
                $scope.files = [];
                result = [];
                $scope.breadcrumb();
                let promises = filenames.map(filename => {
                    return FileService.getFileInfo($scope.path + filename).then(stat => {
                        result.push(stat);
                    }).catch(err => {
                        console.log(err);
                    })
                });
                $q.all(promises).then(() => {
                    if(result.length > 30) {
                        $scope.files = result.slice(0, 30);
                    } else {
                        $scope.files = result.slice(0, result.length);
                    }
                    $scope.length = result.length;
                })
            }, err => {
                // TODO: has not been test...
                alert(err);
            });
            fs.watch($scope.path, (event, filename) => {
                filename = filename.replace(/(\\)/, '');
                $timeout.cancel($scope.alert);
                if (filename) {
                    $scope.checked = true;
                    $scope.message = `${event}: ${filename}`;
                    $scope.alert = $timeout(()=>{
                        $scope.checked = false;
                    }, 3000)
                } else {
                    $scope.checked = true;
                    $scope.message = '${event}: ${filename}';
                    $scope.alert = $timeout(()=>{
                        $scope.checked = false;
                    }, 3000)
                }
            });
            getSideBar($scope.path.slice(0, $scope.path.length-2));
        }

        /** 获取侧边栏信息 */
        function getSideBar(src) {
            FileService.getFileInfo(src).then(stat => {
                $scope.last = stat;
                FileService.readFile(stat).then(content => {
                    $scope.content = content;
                }, err => {
                    $scope.content = '';
                })
            });
        }

        /** 获取固定磁盘分区信息 */
        function getDisk() {
            $scope.breadcrumb();
            $scope.last = false;
            wmic.disk().then(disks => {
                $scope.disks = disks;
            }, err => { })
        }

        /** 剪切文件后的操作 */
        function cut() {
            if($scope.deletePath && $scope.srcType) {
                FileService.deleteFile($scope.deletePath, false).then(() => {
                    if($scope.path === $scope.prePath) {
                        $scope.files.splice($scope.files.indexOf($scope.files[$scope.preId]), 1);
                        result.splice($scope.files.indexOf($scope.files[$scope.preId]), 1);
                        $scope.length = result.length;
                    }
                }, err => {
                    console.log(err);
                })
            } else if($scope.deletePath && !$scope.srcType) {
                FileService.deleteFolder($scope.deletePath, false).then(() => {
                    if($scope.path === $scope.prePath)  {
                        $scope.files.splice($scope.files.indexOf($scope.files[$scope.preId]), 1);
                        result.splice($scope.files.indexOf($scope.files[$scope.preId]), 1);
                        $scope.length = result.length;
                        $scope.length = result.length;
                    }
                }, err => {
                    console.log(err);
                })
            }
            if($scope.deletePath) {
                $scope.src = null;
                $scope.deletePath = null;
            }
        }
    }
}());
