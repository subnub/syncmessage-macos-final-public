const applescript = require("applescript");

const sendToAccessibility = async() => {

    return new Promise((resolve, reject) => {

                const access_script = `tell application "System Preferences"
        activate
        set the current pane to pane id "com.apple.preference.security"
        get the name of every anchor of pane id "com.apple.preference.security"
        reveal anchor "Privacy_Accessibility" of pane id "com.apple.preference.security"
        end tell`

        applescript.execString(access_script, (err, rtn) => {
            
            if (err) {
        
                console.log("applescript Error " + err);
                reject(err);
        
            } else {
        
                resolve(rtn);
            }
        
        
        });

    })
}

const sendToFullDisk = async() => {

    return new Promise((resolve, reject) => {

                const disk_script = `tell application "System Preferences"
        activate
        set the current pane to pane id "com.apple.preference.security"
        get the name of every anchor of pane id "com.apple.preference.security"
        reveal anchor "Privacy_AllFiles" of pane id "com.apple.preference.security"
        end tell`

        applescript.execString(disk_script, (err, rtn) => {
            
            if (err) {
        
                console.log("applescript Error " + err);
                reject(err);
        
            } else {
        
                resolve(rtn);
            }
        
        
        });


    })
}

const checkSendPermission = async() => {

    return new Promise((resolve, reject) => {

        const permission_check = `tell application "Messages"
  
        set myid to get id of first service
        
        set theBuddy to buddy "${555555}" of service id myid
        
        send ${1234} to theBuddy
        
      end tell`

      applescript.execString(permission_check, (err, rtn) => {
            
        if (err) {
    
            if (err.message.includes("get buddy id")) {

                console.log("passed");
                resolve(true);

            } else {

                reject(false);
            }
    
        } else {
    
            resolve(rtn);
        }
    
    
    });


    })
}

module.exports = {sendToAccessibility, sendToFullDisk, checkSendPermission};