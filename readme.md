# 资源管理器
  使用Angular, Node.js, Electron编写的Windows下的资源管理器

###实现功能：

  - 文件和文件夹的增删查改
  - 搜索功能
  - 显示系统信息
  - 监控文件和文件夹的操作
  - 文件分类，用户和权限管理

###已完成功能：

  - 通过WMIC和Node.js的OS模块来显示基本系统信息(2016.6.12)
  - 通过WMIC来得到系统固定磁盘分区和磁盘信息(2016.6.13)
  - 通过Node.js的fs模块来列举文件(2016.6.13)
  - 前进后退功能(2016.6.15)

# 注意
  使用electron-package打包时需要改写main.js

  ```
    const electron = require('electron');
    const app = require('app');
    const BrowserWindow = require('browser-window')

    loadURL -> loadUrl
 ```

 ---
