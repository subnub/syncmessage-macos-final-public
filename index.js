console.log("syncmessage started 2.0.4");

const APP_VERSION = "2.0.4";

// External Modules
const sqlite = require("better-sqlite3");
const fs = require("fs");
const os = require("os");
const unhandled = require('electron-unhandled');
const {ipcRenderer} = require('electron');
const storageJSON = require("electron-json-storage");
const shell = require('electron').shell;
const remote = require('electron').remote;

//console.log(storageJSON.getDefaultDataPath())


// Internal Modules
const {getChats,getMessagesByChatROWID,getLastMessageROWID,getMessagesNeedingUpdate, getNewMessages, findMessageByGuid, getLastMessageByChatROWID, findNewMessage, getLastRecordProperties} = require("./db_functions/db_functions");
const {sleep,limitMessages, dateConverter, readFile, writeFile, writeAllDatabaseFiles} = require("./utils/utils")
const {sendTextMessage, sendImageMessage, sendTextMessgeGroupChat, sendImageMessageGroupChat, sendNewTextMessage, sendNewTextMessageGroupchat} = require("./imessage_functions/imessage");
const {sendToAccessibility, sendToFullDisk, checkSendPermission} = require("./applescript_functions/applescript_functions")

// Keep track of messages already sent, to make sure no duplicated are sent.
const sendMessageList = [];

const os_username = os.userInfo().username;

const iMessagePath = `/Users/${os_username}/Library/Messages/chat.db`
const iMessagePathSHM = `/Users/${os_username}/Library/Messages/chat.db-shm`
const iMessgaePathWAL = `/Users/${os_username}/Library/Messages/chat.db-wal`
let iMessageDB;

// Starts firebase.
const {uploadFirebase} = require("./fb_functions/functions");
require("./fb_functions/config");

// Models
const Message = require("./models/message");
const Chat = require("./models/chat");

const database = firebase.database();
const auth = firebase.auth();

let user;
let userID;

let chatGuidAndMessage = {}
let chatGuidAndChat = {}

// We use this to check for new messaages. 
let lastROWID = 0;

// Keep sent messages in que so they dont send all at once. 
let messagesInQue = [];
let sendMessagesKeys = [];
const sentMessages = [];

// For Swiper
let lastMainRefresh = 0;
let mainRefreshErrorCounter = 0;

// Fast way to check if database has been updated.
let lastPropertieRefreshSaved = 0;

const {ErrorReporting} = require('@google-cloud/error-reporting');

let signedIn = false;

let logginMode = true;
let resetPassword = false;

let setupPOS = 0;


let syncStarted = false;

// Instantiates a client
const errors = new ErrorReporting({
  projectId: 'syncmessage-e01f6',
  keyFilename: './private/syncMessage-5aeb71107f3a.json',
  credentials: require('./private/syncMessage-5aeb71107f3a.json'),
    // Specifies when errors are reported to the Error Reporting Console.
    // See the "When Errors Are Reported" section for more information.
    // Defaults to 'production'
    reportMode: 'always',
    // Determines the logging level internal to the library; levels range 0-5
    // where 0 indicates no logs should be reported and 5 indicates all logs
    // should be reported.
    // Defaults to 2 (warnings)
    logLevel: 5,
});

//errors.report('My error message');

process.on('uncaughtException', (e) => {
    // Write the error to stderr.

    console.error("uncaght", e.stack);
    // Report that same error the Stackdriver Error Service
    errors.report(APP_VERSION + " " +  e.stack);
    //process.exit(1);
})

process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled Rejection at2:', reason.stack || reason)
    // Recommended: send the information to sentry.io
    // or whatever crash reporting service you use
    errors.report(APP_VERSION + " " + reason.stack);
    //process.exit(1);
  })

unhandled({logger:error => {

    console.log("new_error", error.stack)
    errors.report(APP_VERSION + " " + error.stack);
    //process.exit(1);
}});

const createChatAndMessages = async(chats, limitFromFirstKey=false, showSyncStatus=false) => {
    

    let tempChatGuidAndMessage = {}
    let tempChatGuidAndChat = {}

    let counter = 0;

    for(let i = 0; i < chats.length; i++) {

        const chat = chats[i];

        const chatGUID = chat.guid;
        const chatROWID = chat.ROWID;

        let savedKey = undefined;
            if (chatGuidAndChat[chatGUID]) {

                savedKey = chatGuidAndChat[chatGUID].firstMessageROWID;
    
            }
    
        let messages = await getMessagesByChatROWID(chatROWID, userID, sentMessages, iMessageDB, savedKey);
    
        
    
        let messageLength = Object.keys(messages).length;

        let safeLastROWID = 0;
        
        try {
            safeLastROWID = messages[Object.keys(messages)[0]].ROWID;
        } catch (e) {}

        chat.firstMessageROWID = safeLastROWID;
        tempChatGuidAndMessage[chatGUID] = messages;
        tempChatGuidAndChat[chatGUID] = chat;

        counter++;

        if (showSyncStatus) {

            document.getElementById("syncStatus").innerHTML = `Syncing (${i + 1},${chats.length})`;

        }

    }

    return{tempChatGuidAndChat, tempChatGuidAndMessage};

}

const deleteAll = async() => {


    try {

        await database.ref().child("Profiles").child(userID).child("Messages").remove();
    } catch(e) {console.log("delete_err", e)}

    try {

        await database.ref().child("Profiles").child(userID).child("Users").remove();
    } catch(e) {console.log("delete_err", e)}

    try {

        await database.ref().child("Profiles").child(userID).child("new_message").remove();
    } catch(e) {console.log("delete_err", e)}

    try {

        await database.ref().child("Profiles").child(userID).child("Notification_Messages").remove();
    } catch(e) {console.log("delete_err", e)}


    return; 

}

const getFirstChatsAndMessage = async(startListening = false) => {

    console.log("deleting")
    await deleteAll();
    console.log("deleted")

    lastROWID = getLastMessageROWID(iMessageDB);


    const dateObj = new Date();
    const savedTime = dateObj.getTime();
    const allChats = getChats(iMessageDB);

    savedFirstChats = allChats;

    console.log("createChat")
    const chatAndMessage = await createChatAndMessages(allChats, false, true);
    console.log("createdChat")

    chatGuidAndChat = chatAndMessage.tempChatGuidAndChat;
    chatGuidAndMessage = chatAndMessage.tempChatGuidAndMessage;

    const newDateObj = new Date();
    console.log("time_test", newDateObj.getTime() - savedTime);

    console.log("uploading")
    await uploadFirstMessages();
    await addDrawSlideTime();

    if (startListening) {

        console.log("listening for updates");
        startListeneringToDraw();
        startListeneringForMessages();
        startMessageLooper();

    }
    
    console.log("uploaded")

    return;

}

const signIn = async(email, password) => {

    signedIn = true;

    return new Promise((resolve, reject) => {

        console.log(email, password);

        auth.signInWithEmailAndPassword(email, password).then((result) => {

            user = auth.currentUser;
            userID = user.uid;
            console.log("signin in")
            resolve()
        }).catch((e) => {

            console.log(e);
            signedIn = false;
            reject(e);
        })
    })
}

const createAccount = async(email, password) => {

    signedIn = true;

    return new Promise((resolve, reject) => {

        auth.createUserWithEmailAndPassword(email, password).then((result) => {

            user = auth.currentUser;
            userID = user.uid;
            user.sendEmailVerification();
            console.log("created account")
            resolve();
        }).catch((e) => {

            signedIn = false;
            console.log(e);
            reject(e);
        })
    })
}

const setCustomization = () => {

    document.body.style.backgroundColor = "#008577";

}

const setViewListeners = () => {

    document.getElementById("materialButton").addEventListener("click", signinButtonEvent);
    document.getElementById("createAcctText").addEventListener("click", createAccountEvent);
    document.getElementById("resetPasswordText").addEventListener("click", resetPasswordEvent);
    document.getElementById("settingsIcon").addEventListener("click", settingsButtonEvent);
}

const settingsButtonEvent = () => {

    document.getElementById('messageSyncDiv').style.display = "none";
    document.getElementById("settingsDiv").style.display = "block";
    document.getElementById("settingsBackArrow").addEventListener("click", backToSync)

    document.getElementById("loggoutTextWrapper").addEventListener("click", logoutEvent);

    document.getElementById("backToSetupTextWrapper").addEventListener("click", backToSetup);
}

const backToSetup = () => {

    document.getElementById("settingsDiv").style.display = "none";
    startSetup();
}

const logoutEvent = () => {

    remote.app.relaunch();
    remote.app.exit(0);
}

const backToSync = () => {

    console.log("clicked");
    ipcRenderer.send('resize-sync');
    document.getElementById("settingsDiv").style.display = "none";
    document.getElementById("messageSyncDiv").style.display = "block";
    document.body.style.backgroundColor = "#FFFFFF";
}

const resetPasswordEvent = () => {

    resetPassword = !resetPassword;

    logginMode = true;

    if (resetPassword) {

        document.getElementById("materialButton").innerHTML = "RESET"
        document.getElementById("createAcctText").style.visibility = "hidden"
        document.getElementById("resetPasswordText").innerHTML = "Back To Login"
        document.getElementById("passwordDiv").style.visibility = "hidden"

    } else {

        document.getElementById("createAcctText").style.visibility = "visible"
        document.getElementById("resetPasswordText").innerHTML = "Trouble Login In? Reset Password"
        document.getElementById("passwordDiv").style.visibility = "visible"
        document.getElementById("materialButton").innerHTML = "LOGIN"
        document.getElementById("createAcctText").innerHTML = "No Account Yet? Create Account";
    
    }

}

const sendEmailVerification = () => {

    console.log("email verification");
    user.sendEmailVerification();
    alert("Sent Email Verification");

}

const createAccountEvent = async() => {

    console.log("create account");

    logginMode = !logginMode;

    if (logginMode === true) {

        document.getElementById("materialButton").innerHTML = "LOGIN"
        document.getElementById("createAcctText").innerHTML = "No Account Yet? Create Account";

    } else {

        document.getElementById("materialButton").innerHTML = "CREATE"
        document.getElementById("createAcctText").innerHTML = "Already Have An Account? Sign In"
    }

}

const resetPasswordFunction = async(email) => {

    signedIn = true;

    return new Promise((resolve, reject) => {

        auth.sendPasswordResetEmail(email).then((result) => {

            console.log("password reset sent");
            resolve();

        }).catch((e) => {

            console.log(e);
            reject(e);
        })
    })
}

const signinButtonEvent = async() => { 

    let usernameInput = document.getElementById("emailInput");
    let passwordInput = document.getElementById("passwordInput");
    let loadingSpinner = document.getElementById("mainLoadingSpinner");
    
    loadingSpinner.style.visibility = "visible";

    let usernameText = usernameInput.value;
    let passwordText = passwordInput.value;

    if ((signedIn|| usernameText === undefined || usernameText.length === 0 || passwordText === undefined || passwordText.length === 0) && !resetPassword) {

        loadingSpinner.style.visibility = "hidden";
        return;
    }
    
    console.log("login button clicked");

    if (resetPassword) {

        try {
            
            await resetPasswordFunction(usernameText);
            alert("Password Reset Sent");

        } catch (e) {

            console.log(e);
            alert("Could Not Reset Password");
        }

        loadingSpinner.style.visibility = "hidden";
        signedIn = false;

    } else if (logginMode) {

        try {

            await signIn(usernameText, passwordText);
            
            if (!user.emailVerified) {
    
                alert("Please Verify Email Address First")
                loadingSpinner.style.visibility = "hidden";
                document.getElementById("resendEmail").style.visibility = "visible";
                document.getElementById("resendEmail").addEventListener("click", sendEmailVerification);
                signedIn = false;
                
                return;
            }
    
            loadingSpinner.style.visibility = "hidden";
            start();
    
        } catch (e) {
    
            loadingSpinner.style.visibility = "hidden";
    
            alert("Login Error");
    
    
        }

    } else {

        try {

            await createAccount(usernameText, passwordText);
            loadingSpinner.style.visibility = "hidden";
            alert("Email Verification Sent");
            signedIn = false;
            createAccountEvent();

        } catch (e) {

            loadingSpinner.style.visibility = "hidden";
            alert("Create Account Error");
            signedIn = false;

        }
    }

    
    

}

const checkSetupCompleted = async() => {

    return new Promise((resolve, reject) => {

        storageJSON.get('tos_accepted2', function(error, data) {

            console.log("data", data);
            if (data.accepted && data.accepted === "accepted") {

                resolve(true);

            } else {

                resolve(false);
            }
            
        })
    

    })


}

const completeSetup = async() => {

    return new Promise((resolve, reject) => {

        storageJSON.set('tos_accepted2', { accepted: "accepted" }, function(error) {
            if (error) {

                console.log(error);
                reject(error);
            
            } else {

                resolve();
            } 
       });
    })    
}

const startSetup = async() => {

    setupPOS = 0;

    const newerMacOSVersion = parseInt(os.release().split(".")[0]) >= 18;

    console.log("setup_newer", newerMacOSVersion);
    
    ipcRenderer.send('resize-setup');
    document.getElementById("mainDiv").style.display = "none";
    document.getElementById("setupDiv").style.display = "block";
    document.body.style.backgroundColor = "#FFFFFF";

    document.getElementById("setupText").innerHTML = 'If a permission prompt pops up please accept the prompt, syncMessage will then take you into the "Accessibility" Settings, here click the "+" button, a folder will appear and select the syncMessage Application, again make sure syncMessage is under the "Applications" folder. This is needed in order for syncMessage to send messages.'

    document.getElementById("setupImage").src = "./media/thirdStep.gif";

    await sendToAccessibility();

    document.getElementById("setupArrow").addEventListener("click", nextSetupPage);

    

    document.getElementById("skipButton").addEventListener("click", startTOS)

    document.getElementById("havingTroubleTextWrapper").addEventListener("click", havingTroubleLaunch)
}

const havingTroubleLaunch = () => {

    shell.openExternal("http://syncmessage-android.com/how-to")
}

const nextSetupPage = async() => {

    setupPOS++;

    const newerMacOSVersion = parseInt(os.release().split(".")[0]) >= 18;

    if (setupPOS === 1 && newerMacOSVersion) {

        document.getElementById("setupText").innerHTML = `Next, syncMessage will take you to the full-disk option, again press the "+" button, and add the syncMessage Application. This is needed so syncMessage has access to your messages file. MacOS might warn you that it needs to quit the application, ignore this for now you can restart syncMessage later.`

        document.getElementById("setupImage").src = "./media/forthStep.gif";

        await sendToFullDisk();

    } else if (setupPOS === 2 && newerMacOSVersion) {

        document.getElementById("setupText").innerHTML = `Next, syncMessage will prompt you for permission to send messages, if this does not popup syncMessage already has message permissions, just press next.`

        document.getElementById("setupImage").src = "./media/fifthStep.gif";

        console.log(await checkSendPermission());

    } else if (setupPOS === 3 && newerMacOSVersion) {

        document.getElementById("setupText").innerHTML = `Lastely close and reopen syncMessage. (Optional) You should change your power settings to make sure your mac never goes to sleep, but this is not required`

        document.getElementById("setupImage").src = "./media/eigthstep.gif";

    } else if (setupPOS === 4 && newerMacOSVersion) {

        startTOS();

    } else if (setupPOS === 1 && !newerMacOSVersion) {

        document.getElementById("setupText").innerHTML = `Next, syncMessage will prompt you for permission to send messages, if this does not popup syncMessage already has message permissions, just press next.`

        document.getElementById("setupImage").src = "./media/fifthStep.gif";

        console.log(await checkSendPermission());


    } else if (setupPOS === 2 && !newerMacOSVersion) {

        document.getElementById("setupText").innerHTML = `Lastely close and reopen syncMessage. (Optional) You should change your power settings to make sure your mac never goes to sleep, but this is not required`

        document.getElementById("setupImage").src = "./media/eigthstep.gif";
        
    } else if (setupPOS === 3 && !newerMacOSVersion) {

        startTOS();        
    }

    console.log("next_setup", setupPOS);

}

const startTOS = async() => {

    document.getElementById("setupDiv").style.display = "none";
    document.getElementById("TOSdiv").style.display = "block";
    document.getElementById("acceptTOSCheckBox").addEventListener("click", acceptTOSCheckBoxEvent);

    document.getElementById("acceptTOSButton").addEventListener("click", acceptTOS);
}

const acceptTOSCheckBoxEvent = () => {

    if(document.getElementById("acceptTOSCheckBox").checked) {

        document.getElementById("acceptTOSButtonWrapper").style.opacity = 1;

    } else {

        document.getElementById("acceptTOSButtonWrapper").style.opacity = 0.5;
    }
}

const acceptTOS = async() => {

    if (document.getElementById("acceptTOSCheckBox").checked) {

        await completeSetup();
        document.getElementById("TOSdiv").style.display = "none";
        document.getElementById("messageSyncDiv").style.display = "block";
        document.body.style.backgroundColor = "#FFFFFF";
        ipcRenderer.send('resize-sync');
        document.getElementById("syncButtonWrapper").addEventListener("click",syncButtonEvent);

        //syncStarted = false;

    } else {

        alert("Please Accept The Agreement")
    }
}

const syncButtonEvent = async() => {

    if (syncStarted) {

        return;
    }

    syncStarted = true;

    document.getElementById("syncStatus").innerHTML = "Starting Sync";
  
    try {
        await writeAllDatabaseFiles();

    } catch(e) {
        errors.report(APP_VERSION + "Caught DB Write Error: " +  e);
    }
    


    if (!fs.existsSync(`/Users/${os_username}/sync_message_images/chat.db`)) {

        syncStarted = false;
        document.getElementById("syncStatus").innerHTML = "Database Error, Please Try Again";
        return;
    }

    try {

        iMessageDB = require('better-sqlite3')(`/Users/${os_username}/sync_message_images/chat.db`);

    } catch(e) {

        syncStarted = false;
        document.getElementById("syncStatus").innerHTML = "Database Error, Please Try Again";
        return;
    }
    
    
    await getFirstChatsAndMessage(true);
    await addUploadTime();

    checkIfMainThreadAlive();
    newMessageTest();

}

const start = async() => {

    const setupCheck = await checkSetupCompleted();
    
    if (!setupCheck) {

        startSetup();
        return;
    }
    document.getElementById("mainDiv").style.display = "none";
    document.getElementById("messageSyncDiv").style.display = "block";
    document.body.style.backgroundColor = "#FFFFFF";
    ipcRenderer.send('resize-sync');

    const permissionCheckBool = await permissionCheck();

    if (!permissionCheckBool) {
        
        document.getElementById("syncErrorStatus").style.display = "block";
        document.getElementById("syncStatus").innerHTML = "Permission Error";
        return;
    }
    

    document.getElementById("syncButtonWrapper").addEventListener("click",syncButtonEvent);

}

const permissionCheck = async() => {

    const checkSendPermissionBool = await checkSendPermission();

    if (!checkSendPermissionBool) {return false;}

    try {

        await writeAllDatabaseFiles();
        return true;

    } catch (e) {

        console.log(e);
        return false; 
    }
    
}

const main = async() => {

    setCustomization();
    setViewListeners();
}


const checkIfMainThreadAlive = async() => {

    while (true) {

        if (lastMainRefresh === 0) {

            await sleep(5000);
            continue;
        }

        const dateObj = new Date();
        const savedTime = dateObj.getTime();

        if ((savedTime - lastMainRefresh) > 120000 && messagesInQue.length === 0) {

            lastMainRefresh = savedTime;
            mainRefreshErrorCounter++;
            console.log("main_needs_restart");

            if (mainRefreshErrorCounter >= 10) {

                console.log("max_amount of errors!");
                // Show error message;
            
            } else {

                console.log("restarting_main");
                iMessageDB = sqlite(iMessagePath);
                await getFirstChatsAndMessage();
                newMessageTest();
            }

            
            
            
        }

        await sleep(5000);

    }

}

const startListeneringForMessages = async() => {

    database.ref().child("Profiles").child(userID).child("new_message").on('child_added', async(data) => {

        if (data === undefined || data === null) {

            return;
        }

        if (sendMessagesKeys.includes(data.key)) {

            console.log("message already in list");
            return;
        }

        const newMessage = data.val();
        console.log("new_message", newMessage);
        console.log("new_message_key", data.key);
        messagesInQue.push(newMessage);
        sendMessagesKeys.push(data.key);

        const dateObj = new Date();
        const savedTime = dateObj.getTime();

        lastMainRefresh = savedTime;
        
    })
}

const startMessageLooper = async() => {

    while (true) {

        const tempMessagesInQue = messagesInQue;

        let messagesInList = false;

        for(let i=0; i < tempMessagesInQue.length;i++) {

            messagesInList = true;

            const newMessage = tempMessagesInQue[i];

            try {

                if (newMessage.new_message !== undefined && newMessage.new_message !== null && newMessage.new_message === true && newMessage.is_group_chat === false) {

                    await sendNewTextMessage(newMessage.user_list[0], newMessage.message);
                    messagesInQue = messagesInQue.filter(currentMessge => JSON.stringify(newMessage) !== JSON.stringify(currentMessge))
                    sentMessages.push({key: newMessage.pushID, pushID:newMessage.pushID,message: {}});
                    continue;

                }  else if (newMessage.new_message !== undefined && newMessage.new_message !== null && newMessage.new_message === true) {

                    await sendNewTextMessageGroupchat(newMessage.user_list, newMessage.message);
                    messagesInQue = messagesInQue.filter(currentMessge => JSON.stringify(newMessage) !== JSON.stringify(currentMessge))
                    sentMessages.push({key: newMessage.pushID, pushID:newMessage.pushID,message: {}});
                    continue;
                }
                
                const lastMessageOfChat = getLastMessageByChatROWID(newMessage.parent_index);

                
                if (newMessage.filename !== undefined && newMessage.filename !== null && newMessage.is_group_chat === false) {
                    // Images non groupchats
                    await sendImageMessage(newMessage.username, newMessage, userID);

                } else if (newMessage.is_group_chat === false){
                    //  Text Messages Non Groupchats
                    await sendTextMessage(newMessage.username, newMessage.message);
                
                } else if (newMessage.filename !== undefined && newMessage.filename !== null) {
                    // Images Groupchats
                    await sendImageMessageGroupChat(newMessage.guid, newMessage, userID)

                } else {
                    // Text Messages Groupchats
                    await sendTextMessgeGroupChat(newMessage.guid, newMessage.message);
                }

                
                
                const foundMessage = await findNewMessage(lastMessageOfChat, newMessage.parent_index);

                sentMessages.push({key: foundMessage.ROWID, pushID:newMessage.pushID,message: foundMessage});

                console.log("found_message", foundMessage);
              
                messagesInQue = messagesInQue.filter(currentMessge => JSON.stringify(newMessage) !== JSON.stringify(currentMessge));

            } catch(e) {
                console.log("send message error", e);
                messagesInQue = messagesInQue.filter(currentMessge => JSON.stringify(newMessage) !== JSON.stringify(currentMessge))
            }
        }


        if (messagesInList) {

            const dateObj = new Date();
            const savedTime = dateObj.getTime();

            lastMainRefresh = savedTime;
        }
   
        await sleep(5000);
        continue;
    }
}

const addDrawSlideTime = async() => {

    return new Promise((resolve, reject) => {

        const currentDate = new Date();
        database.ref().child("Profiles").child(userID).child("swipe_date").set("S-"+currentDate.getTime());
        resolve();
    })
}

const startListeneringToDraw = async() => {

    let ignore = true;

    database.ref().child("Profiles").child(userID).child("swipe_date").on('value', function(data) {

        if (data.val() == undefined || data.val() == null) {

           return; 
        }

        if (!ignore) {

            const swipe_date = data.val();
         
            if (!swipe_date.includes("S-")) {

                addDrawSlideTime();
            }
        } else {

            ignore = false;
        }
        
    })
}

const addUploadTime = async() => {

    return new Promise((resolve, reject) => {

        const currentDate = new Date();
        database.ref().child("Profiles").child(userID).child("upload_date").set(currentDate.getTime());
        resolve();
    })
}

main();

const verifyChats = async() => {

    const newAllChats = getChats(iMessageDB);


    const newChatAndMessage = await createChatAndMessages(newAllChats, true);

    const newChatGuidAndChat = newChatAndMessage.tempChatGuidAndChat;

    const oldChatKeys = Object.keys(chatGuidAndChat);
    const newChatKeys = Object.keys(newChatGuidAndChat);

    if (oldChatKeys.length !== newChatKeys.length) {

        console.log("needs reload")
        await getFirstChatsAndMessage();
        addUploadTime();
        console.log("reloaded");
        return true;
    } 
    
    for(let i = 0; i < oldChatKeys.length; i++) {

        const currentOldChat = chatGuidAndChat[oldChatKeys[i]];
        const currentNewChat = newChatGuidAndChat[newChatKeys[i]];

        if (currentOldChat.ROWID !== currentNewChat.ROWID) {

            console.log("needs reload")
            await getFirstChatsAndMessage();
            console.log("reloaded");
            return true;

        } else if (currentOldChat.guid !== currentNewChat.guid) {

            console.log("needs reload")
            await getFirstChatsAndMessage();
            console.log("reloaded");
            return true;

        }
    }

    return false;
}

const newMessageTest = async() => {

    while (true) {

        await sleep(7000);

        const dateObjRefresh = new Date();
        const savedTimeRefesh = dateObjRefresh.getTime();

        lastMainRefresh = savedTimeRefesh;

        if (messagesInQue.length != 0) {

            console.log("messages in que, continueing");
            continue;
        }

        iMessageDB = require('better-sqlite3')(iMessagePath);


        const lastPropertieRefresh = getLastRecordProperties(iMessageDB);

        if (lastPropertieRefresh == lastPropertieRefreshSaved) {

            console.log("no refresh needed");
            continue;
        }

        document.getElementById("syncStatus").innerHTML = `Syncing`

        lastPropertieRefreshSaved = lastPropertieRefresh;

        await writeAllDatabaseFiles();
        iMessageDB = require('better-sqlite3')(`/Users/${os_username}/sync_message_images/chat.db`);


        const newLastROWID = getLastMessageROWID(iMessageDB);
   
        if (newLastROWID != lastROWID) {


            const newAllChats = getChats(iMessageDB);
            
            const newChatAndMessage = await createChatAndMessages(newAllChats, true);
        
            const newChatGuidAndChat = newChatAndMessage.tempChatGuidAndChat;
            const newChatGuidAndMessage = newChatAndMessage.tempChatGuidAndMessage;
    
            const verify = await verifyChats();
        
    
            if (verify) {
                continue;
            }

            await newMessageTest2(newChatAndMessage);
      
            await readReciptTest(newChatAndMessage);
           
            lastROWID = newLastROWID;
            
            chatGuidAndMessage =  newChatGuidAndMessage;

            console.log("new messages");

        } else {

            const newAllChats = getChats(iMessageDB);
           
            const newChatAndMessage = await createChatAndMessages(newAllChats, true);
            
            const newChatGuidAndChat = newChatAndMessage.tempChatGuidAndChat;
            const newChatGuidAndMessage = newChatAndMessage.tempChatGuidAndMessage;

            await readReciptTest(newChatAndMessage);
           
            console.log("updated read");
        }

        

        mainRefreshErrorCounter = 0;
        document.getElementById("syncStatus").innerHTML = `Synced`
        console.log("contining_mesesages");

    }
}

const newMessageTest2 = async(newChatAndMessage) => {

    const verify = await verifyChats();

    if (verify) {

        console.log("chats different");
        return false;
    }

    console.log("update!");

    const newChatGuidAndChat = newChatAndMessage.tempChatGuidAndChat;
    const newChatGuidAndMessage = newChatAndMessage.tempChatGuidAndMessage;

    const {messagesToAdd, oldChatGuidAndMessage} = getNewMessages(chatGuidAndMessage, newChatGuidAndMessage, chatGuidAndChat);

    await uploadNewMessages(messagesToAdd);

    return true;
    
}

const readReciptTest = async(newChatAndMessage) => {

    const verify = await verifyChats();

    if (verify) {

        console.log("chats different");
        return false;
    }

    const newChatGuidAndChat = newChatAndMessage.tempChatGuidAndChat;
    const newChatGuidAndMessage = newChatAndMessage.tempChatGuidAndMessage;


    const messagesNeedingUpdateAndOldChat = getMessagesNeedingUpdate(chatGuidAndMessage, newChatGuidAndMessage, chatGuidAndChat);
    const messagesNeedingUpdate = messagesNeedingUpdateAndOldChat.messagesNeedingUpdate;
    const oldUpdatedChatGuidAndMessage = messagesNeedingUpdateAndOldChat.oldChatGuidAndMessage;

    chatGuidAndMessage = oldUpdatedChatGuidAndMessage;

    await uploadReadUpdates(messagesNeedingUpdate);

    return true;

}

const uploadReadUpdates = async(messagesNeedingUpdateDict) => {

    const messagesNeedingUpdateDictKeys = Object.keys(messagesNeedingUpdateDict);

    return new Promise((resolve, reject) => {


        messagesNeedingUpdateDictKeys.forEach((messageKey) => {

            const message = messagesNeedingUpdateDict[messageKey];
            const index = messageKey.split("__")[0];


            console.log("updaing", index);
            console.log("updating_value", message.is_read);
            database.ref().child("Profiles").child(userID).child("Messages").child(index).child(message.ROWID).child("is_read").set(message.is_read);
            database.ref().child("Profiles").child(userID).child("Messages").child(index).child(message.ROWID).child("is_delivered").set(message.is_delivered);
            database.ref().child("Profiles").child(userID).child("Messages").child(index).child(message.ROWID).child("is_sent").set(message.is_sent);

        })

        resolve()
    })
}

const uploadNewMessages = async(messagesNeedingUploadDict) => {

    const messagesNeedingUploadDictKeys = Object.keys(messagesNeedingUploadDict);

    console.log("messges needing upload", messagesNeedingUploadDict)
    return new Promise((resolve, reject) => {

        let counter = 0;
        messagesNeedingUploadDictKeys.forEach((messageKey) => {

            counter++;

            const message = messagesNeedingUploadDict[messageKey];

            const index = messageKey.split("__")[0];


            if(message.is_expression) {

                if (message.assoicate_rowid === undefined || message.assoicate_rowid === null ||  message.assoicate_rowid.length === 0
                    || message.expression_type.toString() === undefined || message.expression_type.toString() === null 
                    || message.expression_type === undefined || message.expression_type === null) {

                        console.log("message not in list!");
                    } else {


                        console.log("new expression!");
                        database.ref().child("Profiles").child(userID).child("Messages").child(index).child(message.assoicate_rowid).child("reactions").child(message.expression_type.toString()).set(message.expression_type);

                    }
            }
        
            
            console.log("updaing", index);
            console.log("updating_value", message);
            database.ref().child("Profiles").child(userID).child("Messages").child(index).child(message.ROWID).set(message);
            database.ref().child("Profiles").child(userID).child("Users").child(index).child("last_message").set(message.text);
            database.ref().child("Profiles").child(userID).child("Users").child(index).child("last_message_date").set(message.date);
            database.ref().child("Profiles").child(userID).child("Users").child(index).child("last_message_date_converted").set(dateConverter(message.date));

            if (!message.is_from_me) {

                database.ref().child("Profiles").child(userID).child("Notification_Messages").child(index).child(message.ROWID).set(message);
            }
            addUploadTime();
        })


        resolve()
    })
}

const uploadFirstMessages = async() => {

    document.getElementById("syncStatus").innerHTML = `Uploading`
    await uploadFirebase(chatGuidAndChat, chatGuidAndMessage, userID);
    document.getElementById("syncStatus").innerHTML = `Synced`;
    console.log("uploaded");
}
