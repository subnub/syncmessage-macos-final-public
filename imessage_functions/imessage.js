const {fixiMessageMessage, downloadFile} = require("../utils/utils");
const applescript = require("applescript");
const os = require("os");

const os_username = os.userInfo().username;

const sendTextMessage = async(username, message) => {

    return new Promise((resolve, reject) => {

        message = fixiMessageMessage(message);

            apple_scipt_text = `tell application "Messages"
        
        set myid to get id of first service
        
        set theBuddy to buddy "${username}" of service id myid
        
        send ${message} to theBuddy
        
        end tell`

        console.log("applescript", applescript);

        applescript.execString(apple_scipt_text, (err, rtn) => {
            
            if (err) {

                console.log("applescript Error " + err);
                reject(err);

            } else {

                resolve(rtn);
            }


        });

    })

    
}

const sendNewTextMessage = async(username, message) => {

    return new Promise((resolve, reject) => {

        message = fixiMessageMessage(message);

        apple_scipt_text = String.raw`set targetBuddyHandle to "${username}"

          tell application "Messages"
            if not running then run
            activate
            set thisBuddy to first buddy whose handle is targetBuddyHandle and service type of service of it is iMessage
            set thisChat to make new text chat with properties {participants:{thisBuddy}}
            
            set thisMessage to send ${message} to thisChat
            
          end tell`

        applescript.execString(apple_scipt_text, (err, rtn) => {
            if (err) {
           
                reject(err)
           } else {

                resolve()
           }
 
     });
    })
}

const sendImageMessage = async(username, message, userID) => {

    return new Promise((resolve, reject) => {


        let storage_ref = firebase.storage().ref().child("Profiles").child(userID).child("attachments").child(message.filename);

          storage_ref.getDownloadURL().then(function(url) {
            
            let download_picture = downloadFile(url, message.filename, function() {

                            let apple_scipt_text = `tell application "Messages"
                
                set serviceID to id of 1st service whose service type = iMessage
                
                set theAttachment1 to POSIX file "/Users/${os_username}/sync_message_images/${message.filename}"
                
                send theAttachment1 to buddy "${username}" of service id serviceID
                
                end tell`

              applescript.execString(apple_scipt_text, (err, rtn) => {
               if (err) {
                console.log("applescript Error " + err);
                reject(err)
              }

              resolve()
    
        });
            });

          }).catch(function(err) {

            reject(err);
          })

    })

    
}

const sendTextMessgeGroupChat = async(guid, message) => {

    return new Promise((resolve, reject) => {

        console.log("sending: ", guid);
        message = fixiMessageMessage(message);

            apple_scipt_text = String.raw`tell application "Messages"
    
            set myid to "${guid}"
        
            set mymessage to ${message}
            
            set theBuddy to a reference to text chat id myid
            
            send mymessage to theBuddy
            
        end tell`

        console.log("applescript", applescript);

        applescript.execString(apple_scipt_text, (err, rtn) => {
            
            if (err) {

                console.log("applescript Error " + err);
                reject(err);

            } else {

                resolve(rtn);
            }


        });

    })

}

const sendNewTextMessageGroupchat = async(usernames, message) => {

    return new Promise((resolve, reject) => {

        message = fixiMessageMessage(message);

        let setTargetBuddy = "";
        let setBuddy = "";
        let setChat = "";
    
        let counter = 0;
        for (let currentString of usernames) {
    
          currentString = currentString.replace(" ", "");
    
          console.log("current_string", currentString);

          setTargetBuddy += `set targetBuddyHandle${counter} to "${currentString}"` + "\n";
          setBuddy += `set thisBuddy${counter} to first buddy whose handle is targetBuddyHandle${counter} and service type of service of it is iMessage` + "\n";  
          setChat += `thisBuddy${counter}` + `, `;
    
          counter++;
    
        }
    
        setChat = setChat.substring(0, setChat.length - 2);
    
        let reconstuctedText = "";
        reconstuctedText += setTargetBuddy;
        reconstuctedText +=  `tell application "Messages"` + "\n";
        reconstuctedText += "if not running then run" + "\n";
        reconstuctedText += "activate" + "\n";
        reconstuctedText += setBuddy;
        reconstuctedText += `set thisChat to make new text chat with properties {participants:{${setChat}}}` + "\n"
        reconstuctedText += `set thisMessage to send ${message} to thisChat` + "\n";
        reconstuctedText += `end tell`
        
        console.log("recon: " + reconstuctedText);
    
        apple_scipt_text = String.raw`${reconstuctedText}`

        applescript.execString(apple_scipt_text, (err, rtn) => {
            
            if (err) {

                console.log("applescript Error " + err);
                reject(err);

            } else {

                resolve(rtn);
            }


        });
    })

}

const sendImageMessageGroupChat = async(guid, message, userID) => {

    return new Promise((resolve, reject) => {

        let storage_ref = firebase.storage().ref().child("Profiles").child(userID).child("attachments").child(message.filename);

          storage_ref.getDownloadURL().then(function(url) {
            
            let download_picture = downloadFile(url, message.filename, function() {

                    let apple_scipt_text = String.raw`tell application "Messages"
    
                    set myid to "${guid}"
                
                    set theAttachment1 to POSIX file "/Users/${os_username}/sync_message_images/${message.filename}"
                    
                    set theBuddy to a reference to text chat id myid
                    
                    send theAttachment1 to theBuddy
                    
                end tell`

              applescript.execString(apple_scipt_text, (err, rtn) => {
               if (err) {
                console.log("applescript Error " + err);
                reject(err)
              }

              resolve()
    
        });
            });

          }).catch(function(err) {

            reject(err);
          })

    })
}

module.exports = {sendTextMessage, sendImageMessage, sendTextMessgeGroupChat, sendImageMessageGroupChat, sendNewTextMessage, sendNewTextMessageGroupchat};