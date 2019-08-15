console.log("hello")

const APP_VERSION = "2.0.0";

// External Modules
const sqlite = require("better-sqlite3");
const fs = require("fs");
const os = require("os");
const unhandled = require('electron-unhandled');


// Internal Modules
const {getChats,getMessagesByChatROWID,getLastMessageROWID,getMessagesNeedingUpdate, getNewMessages, findMessageByGuid, getLastMessageByChatROWID, findNewMessage, getLastRecordProperties} = require("./db_functions/db_functions");
const {sleep,limitMessages, dateConverter, readFile, writeFile, writeAllDatabaseFiles} = require("./utils/utils")
const {sendTextMessage, sendImageMessage, sendTextMessgeGroupChat, sendImageMessageGroupChat, sendNewTextMessage, sendNewTextMessageGroupchat} = require("./imessage_functions/imessage");

const sendMessageList = [];

const os_username = os.userInfo().username;

const iMessagePath = `/Users/${os_username}/Library/Messages/chat.db`
const iMessagePathSHM = `/Users/${os_username}/Library/Messages/chat.db-shm`
const iMessgaePathWAL = `/Users/${os_username}/Library/Messages/chat.db-wal`
let iMessageDB;

// Starts firebase
// Closed for unit testing.
const {uploadFirebase} = require("./fb_functions/functions");
require("./fb_functions/config");

// Models
const Message = require("./models/message");
const Chat = require("./models/chat");

// Closed for unit testing
const database = firebase.database();
const auth = firebase.auth();


let user;
let userID;

let chatGuidAndMessage = {}
let chatGuidAndChat = {}
// let savedFirstChats = [];
// let firstMessageKey;

//let photosUploaded = [];

let lastROWID = 0;

let messagesInQue = [];
let sendMessagesKeys = [];
const sentMessages = [];

let lastMainRefresh = 0;
let mainRefreshErrorCounter = 0;

let lastPropertieRefreshSaved = 0;

const {ErrorReporting} = require('@google-cloud/error-reporting');

let signedIn = false;

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

    console.error("uncaght", e);
    // Report that same error the Stackdriver Error Service
    errors.report(APP_VERSION + " " +  e);
    //process.exit(1);
})

process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled Rejection at2:', reason.stack || reason)
    // Recommended: send the information to sentry.io
    // or whatever crash reporting service you use
    errors.report(APP_VERSION + " " + reason);
    //process.exit(1);
  })

unhandled({logger:error => {

    console.log("new_error", error)
    errors.report(APP_VERSION + " " + error);
    //process.exit(1);
}});

//errors.report("init");

//errors.report("test");


const createChatAndMessages = async(chats, limitFromFirstKey=false) => {
    
    //nothere.length
    //throw new Error("test2")

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
    
        // if (messageLength > 50) {
    
        //     let savedKey = undefined;
        //     if (chatGuidAndChat[chatGUID]) {

        //         savedKey = chatGuidAndChat[chatGUID].firstMessageROWID;
    
        //     }

        //     messages = await limitMessages(messages, limitFromFirstKey, savedKey);
        //     messageLength = Object.keys(messages).length;
            
        // }
        
        chat.firstMessageROWID = messages[Object.keys(messages)[0]].ROWID;
        tempChatGuidAndMessage[chatGUID] = messages;
        tempChatGuidAndChat[chatGUID] = chat;

        counter++;

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

    // return new Promise((resolve, reject) => {

    //     try {

    //         database.ref().child("Profiles").child(userID).child("Messages");
    //     } catch(e) {console.log("delete_err", e)}

    //     try {

    //         database.ref().child("Profiles").child(userID).child("Users");
    //     } catch(e) {console.log("delete_err", e)}

    //     try {

    //         database.ref().child("Profiles").child(userID).child("new_message");
    //     } catch(e) {console.log("delete_err", e)}

       

    //     //database.ref().remove();
    //     resolve();
    // })
}

const getFirstChatsAndMessage = async(startListening = false) => {

    console.log("deleting")
    await deleteAll();
    console.log("deleted")

    //iMessageDB = sqlite(iMessagePath);

    lastROWID = getLastMessageROWID(iMessageDB);


    const dateObj = new Date();
    const savedTime = dateObj.getTime();
    const allChats = getChats(iMessageDB);

    savedFirstChats = allChats;

    console.log("createChat")
    const chatAndMessage = await createChatAndMessages(allChats);
    console.log("createdChat")

    chatGuidAndChat = chatAndMessage.tempChatGuidAndChat;
    chatGuidAndMessage = chatAndMessage.tempChatGuidAndMessage;

    const newDateObj = new Date();
    console.log("time_test", newDateObj.getTime() - savedTime);

    console.log("uploading")
    await uploadTest();
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

const setCustomization = () => {

    document.body.style.backgroundColor = "#008577";

}

const setViewListeners = () => {

    document.getElementById("materialButton").addEventListener("click", signinButtonEvent);
}

const signinButtonEvent = async() => { 

    let usernameInput = document.getElementById("emailInput");
    let passwordInput = document.getElementById("passwordInput");
    let loadingSpinner = document.getElementById("mainLoadingSpinner");
    
    loadingSpinner.style.visibility = "visible";

    let usernameText = usernameInput.value;
    let passwordText = passwordInput.value;

    if (signedIn|| usernameText === undefined || usernameText.length === 0 || passwordText === undefined || passwordText.length === 0) {

        loadingSpinner.style.visibility = "hidden";
        return;
    }
    
    console.log("login button clicked");

    try {

        await signIn(usernameText, passwordText);
        console.log("signed in");
        loadingSpinner.style.visibility = "hidden";
        start();

    } catch (e) {

        loadingSpinner.style.visibility = "hidden";

        alert("Login Error");


    }
    

}

const start = async() => {

    await writeAllDatabaseFiles();
    iMessageDB = require('better-sqlite3')(`/Users/${os_username}/sync_message_images/chat.db`);

    //await signIn();
    await getFirstChatsAndMessage(true);
    await addUploadTime();
    //readReciptTest();
    checkIfMainThreadAlive();
    newMessageTest();

}
const main = async() => {


    //iMessageDB = sqlite(iMessagePath);

    setCustomization();
    setViewListeners();
    

}


const checkIfMainThreadAlive = async() => {

    while (true) {

        //console.log("checker_started", lastMainRefresh);

        if (lastMainRefresh === 0) {

            await sleep(5000);
            continue;
        }

        //console.log("checking if alive", lastMainRefresh);

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
        

        // try {
        //     const lastMessageOfChat = getLastMessageByChatROWID(newMessage.parent_index);
        //     await sendTextMessage(newMessage.username, newMessage.message);
        //     const foundMessage = await findNewMessage(lastMessageOfChat, newMessage.parent_index);
        //     console.log("found_message", foundMessage);
        // } catch(e) {
        //     console.log("send message error", e);
        // }
        

        
    })
}

const startMessageLooper = async() => {

    while (true) {

        //console.log("while_loop");

        const tempMessagesInQue = messagesInQue;

        let messagesInList = false;

        for(let i=0; i < tempMessagesInQue.length;i++) {

            messagesInList = true;

            //console.log("list_length", tempMessagesInQue.length);

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
                //console.log("messages_in_que", messagesInQue);

                //console.log("removing_message_from_list");
                messagesInQue = messagesInQue.filter(currentMessge => JSON.stringify(newMessage) !== JSON.stringify(currentMessge));
                //console.log("removed_message_from_list");
                //console.log("messages_in_que2", messagesInQue);


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
        
        //console.log("sleeping_main");
        await sleep(5000);
        //console.log("slept_main");
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

        // console.log(currentNewChat)

        // if (JSON.stringify(currentOldChat) !== JSON.stringify(currentNewChat)) {

            
        // }
    }

    return false;

    // return new Promise((resolve, reject) => {

    //     const newAllChats = getChats();


    //     const newChatAndMessage = await createChatAndMessages(newAllChats, true);

    //     const newChatGuidAndChat = newChatAndMessage.tempChatGuidAndChat;

    //     const oldChatKeys = Object.keys(chatGuidAndChat);
    //     const newChatKeys = Object.keys(newChatGuidAndChat);

    //     if (oldChatKeys.length !== newChatKeys.length) {

    //         console.log("needs reload")
    //         await getFirstChatsAndMessage();
    //         console.log("reloaded");
    //         resolve();
    //     } 
        
    //     for(let i = 0; i < oldChatKeys.length; i++) {

    //         const currentOldChat = chatGuidAndChat[oldChatKeys[i]];
    //         const currentNewChat = newChatGuidAndChat[newChatKeys[i]];

    //         if (JSON.stringify(currentOldChat) !== JSON.stringify(currentNewChat)) {

    //             console.log("needs reload")
    //             await getFirstChatsAndMessage();
    //             console.log("reloaded");
    //             resolve();
    //         }
    //     }

    //     resolve()

    //     })

    
}

// const verifyChats()

const newMessageTest = async() => {

    while (true) {

        await sleep(7000);

        //casdfasdf2.length;
        // if (numOfRefreshsNeeded <= 0) {

        //     console.log("no_refresh_needed");
        //     continue;
        // }

        // numOfRefreshsNeeded--;

        const dateObjRefresh = new Date();
        const savedTimeRefesh = dateObjRefresh.getTime();

        lastMainRefresh = savedTimeRefesh;

        //console.log("sleeping")

        if (messagesInQue.length != 0) {

            console.log("messages in que, continueing");
            continue;
        }

        //const  verifyChats = verifyChats();

        //console.log("getting_last_rowid");
        iMessageDB = require('better-sqlite3')(iMessagePath);


        const lastPropertieRefresh = getLastRecordProperties(iMessageDB);

        if (lastPropertieRefresh == lastPropertieRefreshSaved) {

            console.log("no refresh needed");
            continue;
        }

        lastPropertieRefreshSaved = lastPropertieRefresh;

        await writeAllDatabaseFiles();
        iMessageDB = require('better-sqlite3')(`/Users/${os_username}/sync_message_images/chat.db`);


        const newLastROWID = getLastMessageROWID(iMessageDB);
        //console.log("got_last_rowid");

        if (newLastROWID != lastROWID) {


            const newAllChats = getChats(iMessageDB);
            //console.log("got_chats");
    
    
            //console.log("creating_chat_and_message");
            const newChatAndMessage = await createChatAndMessages(newAllChats, true);
            //console.log("created chat and message");
            
    
            // const newAllChats = getChats(iMessageDB);
           
            // const newChatAndMessage = await createChatAndMessages(newAllChats, true);
    
            const newChatGuidAndChat = newChatAndMessage.tempChatGuidAndChat;
            const newChatGuidAndMessage = newChatAndMessage.tempChatGuidAndMessage;
    
            //console.log("newROWID", newLastROWID);
            //console.log("oldROWID", lastROWID);
    
    
            //console.log("verify_chats");
            const verify = await verifyChats();
            //console.log("verified_chats");
    
            if (verify) {
                continue;
            }
    
            //console.log("checking_for_new_messagese");
             await newMessageTest2(newChatAndMessage);
             //console.log("checked_for_new_message");
    
            //console.log("no new messages");
    
            //console.log("checking_read");
            await readReciptTest(newChatAndMessage);
            //console.log("checked_read");
    
    
            lastROWID = newLastROWID;
            
            chatGuidAndMessage =  newChatGuidAndMessage;

            console.log("new messages");

        } else {

            //console.log("getting_chats_read");
            const newAllChats = getChats(iMessageDB);
           // console.log("got_chats_read");

            //console.log("creating_chat_and_message_read");
            const newChatAndMessage = await createChatAndMessages(newAllChats, true);
            //console.log("created chat and message_read");

            const newChatGuidAndChat = newChatAndMessage.tempChatGuidAndChat;
            const newChatGuidAndMessage = newChatAndMessage.tempChatGuidAndMessage;

            //console.log("checking_read_read");
            await readReciptTest(newChatAndMessage);
            //console.log("checked_read_read");
            
            //chatGuidAndMessage =  newChatGuidAndMessage;
    
            console.log("updated read");
        }

        

        mainRefreshErrorCounter = 0;
        console.log("contining_mesesages");

    }
}

const newMessageTest2 = async(newChatAndMessage) => {

    //iMessageDB = sqlite(iMessagePath);
   // const newLastROWID = getLastMessageROWID(iMessageDB);

    // if (newLastROWID == lastROWID) {

    //     console.log("No update")
    //     await sleep(7000);
    //     continue;
    // } 

    const verify = await verifyChats();

    if (verify) {

        console.log("chats different");
        return false;
    }

    console.log("update!");

    //const newAllChats = getChats(iMessageDB);

    //const newChatAndMessage = await createChatAndMessages(newAllChats, true, sendMessageList);


    const newChatGuidAndChat = newChatAndMessage.tempChatGuidAndChat;
    const newChatGuidAndMessage = newChatAndMessage.tempChatGuidAndMessage;

    const {messagesToAdd, oldChatGuidAndMessage} = getNewMessages(chatGuidAndMessage, newChatGuidAndMessage, chatGuidAndChat);

    await uploadNewMessages(messagesToAdd);

    //chatGuidAndMessage = oldChatGuidAndMessage;

    //iMessageDB = sqlite(iMessagePath);
    //lastROWID = getLastMessageROWID(iMessageDB);

    return true;

    // while (true) {

    //     const newLastROWID = getLastMessageROWID();

    //     if (newLastROWID == lastROWID) {

    //         console.log("No update")
    //         await sleep(7000);
    //         continue;
    //     } 

    //     console.log("update!");

    //     const newAllChats = getChats();


    //     const newChatAndMessage = await createChatAndMessages(newAllChats, true);

    //     const newChatGuidAndChat = newChatAndMessage.tempChatGuidAndChat;
    //     const newChatGuidAndMessage = newChatAndMessage.tempChatGuidAndMessage;

    //     const {messagesToAdd, oldChatGuidAndMessage} = getNewMessages(chatGuidAndMessage, newChatGuidAndMessage, chatGuidAndChat);

    //     await uploadNewMessages(messagesToAdd);

    //     chatGuidAndMessage = oldChatGuidAndMessage;

    //     lastROWID = getLastMessageROWID();

    //     await sleep(7000);
    // }

    
}

const readReciptTest = async(newChatAndMessage) => {

    //console.log("checking for read updates")


    //const newAllChats = getChats(iMessageDB);


    const verify = await verifyChats();


    if (verify) {

        console.log("chats different");
        return false;
    }

        
    // console.log("sleeping read");
    // await sleep(4000);
    // console.log("slept read");
    


    //const newChatAndMessage = await createChatAndMessages(newAllChats, true);

    const newChatGuidAndChat = newChatAndMessage.tempChatGuidAndChat;
    const newChatGuidAndMessage = newChatAndMessage.tempChatGuidAndMessage;


    const messagesNeedingUpdateAndOldChat = getMessagesNeedingUpdate(chatGuidAndMessage, newChatGuidAndMessage, chatGuidAndChat);
    const messagesNeedingUpdate = messagesNeedingUpdateAndOldChat.messagesNeedingUpdate;
    const oldUpdatedChatGuidAndMessage = messagesNeedingUpdateAndOldChat.oldChatGuidAndMessage;

    //console.log("chat_message_before", chatGuidAndMessage);
    chatGuidAndMessage = oldUpdatedChatGuidAndMessage;
    //console.log("chat_and_message_after", chatGuidAndMessage);
    
    await uploadReadUpdates(messagesNeedingUpdate);

    //chatGuidAndMessage =  newChatGuidAndMessage;

    return true;

    // while (true) {

        
    //     console.log("checking for read updates")

    //     const newAllChats = getChats();


    //     const newChatAndMessage = await createChatAndMessages(newAllChats, true);

    //     const newChatGuidAndChat = newChatAndMessage.tempChatGuidAndChat;
    //     const newChatGuidAndMessage = newChatAndMessage.tempChatGuidAndMessage;


    //     const messagesNeedingUpdate = getMessagesNeedingUpdate(chatGuidAndMessage, newChatGuidAndMessage, chatGuidAndChat);
        
        
    //     await uploadReadUpdates(messagesNeedingUpdate);

    //     chatGuidAndMessage =  newChatGuidAndMessage;

    //     await sleep(7000);
    // }

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


        messagesNeedingUploadDictKeys.forEach((messageKey) => {

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
                //database.ref().child("Messages").child(index).child(message.assoicate_rowid).child("reactions").update
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


const compareMessageDicts = async(oldMessageDict, newMessageDict) => {

    return new Promise((resolve, reject) => {





    })

}

const uploadTest = async() => {

    await uploadFirebase(chatGuidAndChat, chatGuidAndMessage, userID);
    console.log("uploaded");
}

