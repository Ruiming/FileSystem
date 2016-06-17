routeApp.controller('fileCtrl', ['$scope', '$interval', '$q', function($scope, $interval, $q) {

    const   fs = require("fs"),
            path = require('path'),
            mmm = require('mmmagic'),
            exec = require('child_process').exec,
            Magic = mmm.Magic,
            magic = new Magic(mmm.MAGIC_MIME_TYPE),
            remote = require('electron').remote,
            dialog = require('electron').remote.dialog,
            Menu = remote.Menu,
            MenuItem = remote.MenuItem;

    ///////////////////////////////////////
    // 文件右键菜单
    let rightClickPosition = null;
    const menu = new Menu();

    // 删除文件或文件夹     fixme 文件夹删除
    menu.append(new MenuItem({
        label: 'Delete',
        click: function () {
            var selectedElement = document.elementFromPoint(rightClickPosition.x, rightClickPosition.y).parentNode;
            var obj = JSON.parse(selectedElement.attributes.value.nodeValue);
            var path = $scope.path + obj.name;
            if(obj.type != "Folder"){
                fs.unlink(path, function(err){
                    if(err){
                        throw err;
                    }
                    selectedElement.remove();
                })
            }
            else {
                var buttons = ['OK', 'Cancel'];
                dialog.showMessageBox({type: 'question', title: '删除文件夹', buttons: buttons, message: '确认要删除吗? 此操作不可逆!'}, function(index){
                    if(index == 0){
                        exec('rmdir "' + path + '" /S /Q', function(err, stdout, stderr){
                            if(err || stderr){
                                dialog.showErrorBox("删除失败",  stdout + stderr);
                                return;
                            }
                            selectedElement.remove();
                        });
                    }
                })
            }
            // 避免前进到不存在的文件夹
            if(path == $scope.temp[$scope.temp.length-1] || path + "\\\\" == $scope.temp[$scope.temp.length-1]){
                $scope.temp = [];
            }
        }
    }));


    var FILE = document.getElementById("file");
    FILE.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        rightClickPosition = {x: e.x, y: e.y};
        menu.popup(remote.getCurrentWindow())
    }, false);

    ///////////////////////////////////////


    // 其他
    $scope._index = true;
    $scope.path = "Computer";
    $scope.files = [];
    $scope.history = ["Computer"];     // 记录访问的页面，默认在Computer页面
    $scope.temp = [];               // 保存后退记录
    $scope.col = 'Name';
    $scope.desc = 0;


    // 跳进相应磁盘
    $scope.forward = function(disk) {
        $scope.path = disk + "\\\\";
        $scope.history.push($scope.path);        // 每次跳转前记录要访问的路径
        $scope._index = false;
        $scope.read_folder();
    };

    // 跳进相应文件夹
    $scope.forward_folder = function(x) {
        if(x.isFile())  return;                 // 若是文件，则直接返回
        $scope.path += x.name + "\\\\";
        $scope.history.push($scope.path);       // 每次跳转前记录要访问的路径
        $scope.temp = [];                       // 点击进入文件夹会破坏后退记录
        $scope.read_folder();
    };

    // 导航栏跳转
    $scope.turnto = function(x) {
        var currentPath = $scope.path;
        if(x == "Computer" && currentPath != "Computer") {
            $scope.home();
            return;
        }
        else if(x == "Computer" && currentPath == "Computer") {
            return;
        }
        $scope.path = "";
        for(var i=0; i<$scope.breadcrumbs.length; i++){
            if($scope.breadcrumbs[i] != x){
                $scope.path += $scope.breadcrumbs[i] + "\\\\";
            }
            else {
                $scope.path += $scope.breadcrumbs[i] + "\\\\";
                break;
            }
        }
        if(currentPath == $scope.path){
            return;
        }
        $scope.history.push($scope.path);
        $scope.temp = [];
        $scope.read_folder();
    };

    // 跳到主页
    $scope.home = function() {
        $scope.path = "Computer";
        $scope.history.push($scope.path);        // 每次跳转前记录要访问的路径
        $scope._index = true;
        $scope.files = [];
        getDisk();
    };

    $scope.breadcrumb = function(){
        if($scope.path == "Computer"){
            $scope.breadcrumbs = [];
        }
        else{
            $scope.breadcrumbs = $scope.path.split("\\\\");
        }
    };

    // 后退
    $scope.Hbackward = function() {
        if($scope.history == null || $scope.history.length == 1){
            return;
        }
        $scope.temp.push($scope.path);                                      // 记录当前的路径
        $scope.history.pop();                                               // 从历史记录中移除目前路径
        while($scope.history[$scope.history.length-1] != "Computer" &&!fs.existsSync($scope.history[$scope.history.length-1])){
            $scope.history.pop();
        }
        $scope.path = $scope.history[$scope.history.length - 1];            // 取出要后退到的路径
        $scope.files = [];
        if($scope.path == "Computer") {
            $scope.filename = null;
            getDisk();
            $scope._index = true;
        }
        else {
            $scope.read_folder();
            $scope._index = false;
        }
    };

    // 前进
    $scope.Hforward = function(){
        if($scope.temp == null || $scope.temp.length < 1){
            return;
        }
        console.log($scope.temp);
        $scope.path = $scope.temp[$scope.temp.length - 1];  // 获取前进的路径
        $scope.history.push($scope.path);                   // 每次跳转前记录要访问的路径
        $scope.temp.pop();                                  // 前进记录出栈
        if($scope.path == "Computer") {
            $scope.filename = null;
            getDisk();
            $scope._index = true;
        }
        else {
            $scope.read_folder();
            $scope._index = false;
        }
    };

    function getFileInfo(filename) {
        return $q(function(resolve, reject) {
            let path = $scope.path + "////" + filename;
            fs.stat(path, function(err, stat){
                if(err){
                    reject(err);
                }
                else {
                    stat.name = filename;
                    resolve(getFileType(stat));
                }
            });
        });
    }

    function getFileType(stat) {
        return $q(function(resolve, reject) {
            let path = $scope.path + "////" + stat.name;
            magic.detectFile(path, function(err, result) {
                if (err){
                    stat.type = "Folder";
                    resolve(stat);
                }
                else {
                    stat.type = result;
                    resolve(stat);
                }
            });
        })
    }

    // 异步读取路径下的所有文件并获取文件信息
    $scope.read_folder = function(){
        fs.readdir($scope.path,function(err, files){
            if (err) {
                console.log(err);
            }
            else {
                $scope.filenames = files;
                $scope.files = [];
                $scope.breadcrumb();
                // fixme 读取文件过慢
                $scope.filenames.forEach(function(filename){
                    var promise = getFileInfo(filename);
                    promise.then(function(stat){
                        $scope.files.push(stat);
                    });
                });
            }
        });
    };

    // 获取固定分区盘符和基本信息
    function getDisk(){
        $scope.breadcrumb();
        exec('wmic logicaldisk where "drivetype=3" get name,filesystem,freespace,size', function(err, stdout, stderr) {
            if(err || stderr){
                console.log("error: " + err + stderr);
                return;
            }
            $scope.diskStr = stdout.replace(/(FileSystem)|(FreeSpace)|(Name)|(Size)/g, '').replace(/(\s+)/g, '#').trim().split('#');
            $scope.diskStr.pop();
            $scope.diskStr.shift();
            $scope.disks = [];
            for(var i in $scope.diskStr){
                if($scope.diskStr.hasOwnProperty(i)){
                    if(i%4 == 0){
                        $scope.disk.FileSystem = $scope.diskStr[i];
                    }
                    else if(i%4 == 1){
                        $scope.disk.FreeSpace = $scope.diskStr[i];
                    }
                    else if(i%4 == 2){
                        $scope.disk.Name = $scope.diskStr[i];
                    }
                    else if(i%4 == 3){
                        $scope.disk.Size = $scope.diskStr[i];
                        $scope.disks.push($scope.disk);
                        $scope.disk = {};
                    }
                }
            }
        })}


    $scope.disks = [];
    $scope.disk = {};
    getDisk();


}]);
