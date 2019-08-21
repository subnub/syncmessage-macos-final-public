const fs = require("fs");
const exifReader = require("exifreader");
const exif = require("exif-reader"); 
const getExif = require('get-exif');
var sizeOf = require('image-size');
const os = require("os");
const request = require("request");
let exec = require('child_process').exec;

const os_username = os.userInfo().username;

const iMessagePath = `/Users/${os_username}/Library/Messages/chat.db`
const iMessagePathSHM = `/Users/${os_username}/Library/Messages/chat.db-shm`
const iMessgaePathWAL = `/Users/${os_username}/Library/Messages/chat.db-wal`

const skipFileSize = [];

const skipStickerList = [];

const sleep = async(time) => {

    return new Promise((resolve, reject) => {

        setTimeout(() => {

           resolve()
    
        }, time);

    })
    
}

const limitMessages = async(messageDict, limitFromFirstKey, startROWID) => {


    return new Promise((resolve, reject) => {

        const messageKeys = Object.keys(messageDict);

        let limitedDict = {}

        if (limitFromFirstKey) {

            let findStartIndex = 0;

            for(let i = 0; i < messageKeys.length;i++) {

                if (messageKeys[i] == startROWID) {

                    findStartIndex = i;
                    break;
                }
            }
            messagesKeysLimited = messageKeys.slice(findStartIndex, messageKeys.length);

            messagesKeysLimited.forEach((key) => {

            limitedDict[key] = messageDict[key];

            })

        } else {

            messagesKeysLimited = messageKeys.slice(messageKeys.length - 50, messageKeys.length);
           
            messagesKeysLimited.forEach((key) => {

            limitedDict[key] = messageDict[key];

            })


        }
     
        resolve(limitedDict);

    })
}

const readFile = async(picture_file_path) => {

    return new Promise((resolve, reject) => {

      fs.readFile(picture_file_path, function read(err, data) {
      if (err) {
          
          reject(err);
      } else {

          resolve(data);
      }
      })


    })

}

const writeFile = async(data, name) => {

    await make_dir(`/Users/${os_username}/sync_message_images/`);

    return new Promise((resolve, reject) => {

        //make_dir(`/Users/${os_username}/sync_message_images/`)

        fs.writeFile(`/Users/${os_username}/sync_message_images/`+name, data, function (err) {
            if (err) {
                reject(err);
            }
            resolve();
          });
    })
}

const dateConverter = (date) => {

    try {

        var dateVar = new Date();

        var unix = new Date(1970, 1, 1);
        var cocoa = new Date(2001, 1, 1);
        var difference =  cocoa.getTime() - unix.getTime();
    
        var fix_date = parseInt(Math.round(date / 1000000)) + difference;
    
        var fixed_date = new Date(fix_date);

        return fixed_date.getTime();

    } catch (e) {

        var dateVar = new Date();

        return dateVar.getTime();
    }
    
}

const fixiMessageMessage = (message) => {

    let message_split = message.split(/["]/g);
     
    console.log("message", message);

    let fix_message = "";
    for (var i = 0; i < message_split.length; i++) {
            

        fix_message += "\"" + message_split[i] + "\"";
        
        if (i != message_split.length - 1) {
            fix_message += " & "
            fix_message += " quote "
            fix_message += " & "
        }
    }

    console.log("message_fixed" ,fix_message);
    return fix_message;


}

const searchForSavedPictureSize = (messageROWID) => {

    for(let i = 0; i < skipFileSize.length; i++) {

        const currentSkip = skipFileSize[i];

        if (currentSkip.messageROWID === messageROWID) {

            return currentSkip.sizeList;
        }
    }

    return undefined;
}

const getPictureSizes = async(filePathList, messageROWID) => {

    const savedSize = searchForSavedPictureSize(messageROWID);
    
    if(savedSize != undefined) {
        return savedSize;
    }

    let sizeList = [];

    for(let i = 0; i < filePathList.length; i++) {

        const currentFilePath = filePathList[i];
        try {

            var dimensions = sizeOf(currentFilePath);
            
            let X = dimensions.width;
            let Y = dimensions.height;
           
            if (dimensions.orientation != undefined || dimensions.orientation != null) {

                const orientation = dimensions.orientation;

                if (orientation === 1 || orientation === 3) {

                    if (Y > X) {

                        temp_x = X;
                        X = Y;
                        Y = temp_x;
                    }
                } else {

                    if (Y < X) {

                        temp_x = X;
                        X = Y;
                        Y = temp_x;
                    }
                }
            }
            

            const tempString = X + "x" + Y;

            sizeList.push(tempString);

        } catch(e) {

            console.log("error", e);
            const tempString = "Error" + "x" + "Error";

            sizeList.push(tempString);
        }
        

    }

    skipFileSize.push({messageROWID,sizeList})

    return sizeList;

}

const getOrientation = (fileContent) => {

    console.log("starting to read");
    var parser = require("exif-parser").create(fileContent);
    parser.enableImageSize(true);
    parser.enableTagNames(true);
    parser.enableReturnTags(true);
    
    var result = parser.parse();
    let orientation_test = result.tags["Orientation"];

    console.log(orientation_test);

    return;
               
}   

const writeAllDatabaseFiles = async() => {

    const dbData = await readFile(iMessagePath);
    
    await writeFile(dbData, "chat.db");
  
    try {

        const dbDataSHM = await readFile(iMessagePathSHM);

        await writeFile(dbDataSHM, "chat.db-shm");

    } catch (err) {
                
        console.log("db_err", err);
            
    }
    
    try {
    
        const dbDataWAL = await readFile(iMessgaePathWAL);
        
        await writeFile(dbDataWAL, "chat.db-wal");
    
    } catch (err) {
                
        console.log("db_err", err);
    }

    return;
            
}

const fixStickerMessage = async(currentPath, currentFilename) => { 

    await make_dir(`/Users/${os_username}/sync_message_images/`)

    if (skipStickerList.includes(currentFilename)) {

        //console.log("sticker already in list");
        return `/Users/${os_username}/sync_message_images/${currentFilename}`;
    }

    const command = `sips -s format jpeg -s formatOptions 80 "${currentPath}" --out "/Users/${os_username}/sync_message_images/${currentFilename}"`

    function os_func() {
        this.execCommand = function (cmd) {
            return new Promise((resolve, reject)=> {
               exec(command, (error, stdout, stderr) => {
                 if (error) {
                    reject(error);
                    //return;
                }
                resolve(stdout)
               });
           })
       }
     }

     var os = new os_func();

          await os.execCommand('pwd').then(res=> {
              //console.log("os >>>", res);
              return `/Users/${os_username}/sync_message_images/${currentFilename}`;
          }).catch(err=> {
              console.log("os >>>", err);
              throw new Error("failed converting sticker");
          })

    skipStickerList.push(currentPath);
    return `/Users/${os_username}/sync_message_images/${currentFilename}`

}

function downloadFile(uri, filename, callback) {

    make_dir_sync(`/Users/${os_username}/sync_message_images/`);


    request.head(uri, function(err, res, body){
    
      request(uri).pipe(fs.createWriteStream(`/Users/${os_username}/sync_message_images/${filename}`)).on('close', callback);
    });  
    
}

function make_dir_sync (path) {

    fs.mkdir(path, { recursive: true }, (err) => {
    if (err) throw err;
    });
  }

const make_dir = async(path) => {

    return new Promise((resolve, reject) => {

        fs.mkdir(path, { recursive: true }, (err) => {
            if (err) {
                reject();
            } else {
                resolve();
            }
            });

    })
}

module.exports = {sleep, limitMessages, readFile, dateConverter, fixiMessageMessage, getPictureSizes, downloadFile, writeFile, fixStickerMessage,writeAllDatabaseFiles};