const sqlite = require("better-sqlite3");
const Message = require("../models/message");
const Chat = require("../models/chat");
const os = require("os");
const {readFile, dateConverter, getPictureSizes, sleep, fixStickerMessage} = require("../utils/utils");

// Closed For unit testing
const {uploadFile} = require("../fb_functions/functions")

const os_username = os.userInfo().username;


const iMessagePath = `/Users/${os_username}/Library/Messages/chat.db`

const getLastMessageROWID = (iMessageDB) => {

    if (iMessageDB === undefined || iMessageDB === null) {

        const iMessageDB = sqlite(iMessagePath);
    }

    
    const messageDB = iMessageDB.prepare("SELECT * FROM message");
    const readMessageDB = messageDB.all();

    let lastROWID = 0;

    try {

        lastROWID = readMessageDB[readMessageDB.length - 1].ROWID
    } catch (e) {}

    return lastROWID;
}

const getChats = (iMessageDB) => {

    const chatDB = iMessageDB.prepare("SELECT * FROM chat");
    const readChatDB = chatDB.all();

    let chats = [];

    for(let i = 0; i < readChatDB.length; i++ ){

        const chat = readChatDB[i];

        const newChat = new Chat();
        
        const guid = chat.guid;
        const ROWID = chat.ROWID;
        const chatIdentifier = chat.chat_identifier; 
        

        const chatHandleIDs = getChatHandleJoin(ROWID);
        let chatUsers = getChatUsers(chatHandleIDs);

        chatUsers = chatUsers.sort();

        let lastMessage;

        try {
            lastMessage = getLastMessageByChatROWID(ROWID);

            if (!lastMessage) {

                continue;
            }

        } catch (e) {

            continue;
        }
        
        const lastMessageText = lastMessage.text;
        const lastMessageDate = lastMessage.date;
        
        const lastMessageDateConverted = dateConverter(lastMessageDate);

        newChat.guid = guid;
        newChat.ROWID = ROWID;
        newChat.users = chatUsers;
        newChat.is_group_chat = chatUsers.length !== 1;
        newChat.last_message = lastMessageText;
        newChat.last_message_date = lastMessageDate;
        newChat.last_message_date_converted = lastMessageDateConverted;
        newChat.chat_identifier = chatIdentifier;
        
        chats.push(newChat);
    }

    return chats;

    // readChatDB.forEach((chat) => {

    //     const newChat = new Chat();
        
    //     const guid = chat.guid;
    //     const ROWID = chat.ROWID;

    //     const chatHandleIDs = getChatHandleJoin(ROWID);
    //     const chatUsers = getChatUsers(chatHandleIDs);

    //     try {
    //         const lastMessage = getLastMessageByChatROWID(ROWID);
    //     } catch (e) {


    //     }
        

    //     const lastMessageText = lastMessage.text;
    //     const lastMessageDate = lastMessage.date;

    //     newChat.guid = guid;
    //     newChat.ROWID = ROWID;
    //     newChat.users = chatUsers;
    //     newChat.is_group_chat = chatUsers.length !== 1;
    //     newChat.last_message = lastMessageText;
    //     newChat.last_message_date = lastMessageDate;

        
        


    //     chats.push(newChat);
    // })

    
}

const getLastRecordProperties = (iMessageDB) => {

    const propDB = iMessageDB.prepare("SELECT * FROM _SqliteDatabaseProperties");
    const readPropDB = propDB.all();

    return readPropDB[readPropDB.length - 1]["value"];
}

const getLastMessageByChatROWID = (ROWID) => {

    const iMessageDB = sqlite(iMessagePath);    
    const chatJoinDB = iMessageDB.prepare(`SELECT * FROM chat_message_join WHERE chat_id=${ROWID}`)
    const readChatJoinDB = chatJoinDB.all();

    const lastChatJoin = readChatJoinDB[readChatJoinDB.length - 1];
    
    const lastMessageDB = iMessageDB.prepare(`SELECT * FROM message WHERE ROWID=${lastChatJoin.message_id}`);

    const lastMessage = lastMessageDB.all()[0];

    return lastMessage;
}

const getChatHandleJoin = (ROWID) => {

    const iMessageDB = sqlite(iMessagePath);
    const chatHandleJoinDB = iMessageDB.prepare(`SELECT * FROM chat_handle_join WHERE chat_id=${ROWID}`);
    const readChatHandleJoinDB = chatHandleJoinDB.all();

    const handleIDs = [];

    for(let i = 0; i < readChatHandleJoinDB.length; i++) {

        handleIDs.push(readChatHandleJoinDB[i].handle_id);
    }

    return handleIDs;

}

const getChatUsers = (chatHandleIDs) => {

    const chatUsers = [];

    const iMessageDB = sqlite(iMessagePath);

    for(let i = 0; i < chatHandleIDs.length; i++) {

        const ROWID = chatHandleIDs[i];

        const handles = iMessageDB.prepare(`SELECT * FROM handle WHERE ROWID=${ROWID}`)
        const readHandles = handles.all();
        const user_id = readHandles[0].id;

    
        chatUsers.push(user_id);
    }

    return chatUsers;
}

const getPicturePathAndName = (ROWID, iMessageDB) => {

    const attachmentJoinDB = iMessageDB.prepare(`SELECT * FROM message_attachment_join WHERE message_id=${ROWID}`)
    const readAttachmentJoinDB = attachmentJoinDB.all();

    const totalFilenames = [];
    const totalFilePaths = [];

    readAttachmentJoinDB.forEach((attachmentRow) => {

        const attachmentID = attachmentRow.attachment_id;

        const attachmentDB= iMessageDB.prepare(`SELECT * FROM attachment WHERE ROWID=${attachmentID}`)
        const readAttachmentDB = attachmentDB.all();    

        readAttachmentDB.forEach((attachment) => {

            const filenameBeforeSplit = readAttachmentDB[0].filename;
            let fileNameSplit = filenameBeforeSplit.split("/");
            fileNameSplit = fileNameSplit[fileNameSplit.length - 1];

            const filenameRemovedTilday = filenameBeforeSplit.replace("~", "");
            
            let filenameAddRowID = fileNameSplit;

            try {
                filenameAddRowID = fileNameSplit.split(".")[0] + ROWID + "." +fileNameSplit.split(".")[1];
            } catch(e) {

                filenameAddRowID = fileNameSplit;
            }
             
            const filename = filenameAddRowID;

            const filePath = "/Users/" + os_username + filenameRemovedTilday;

            totalFilePaths.push(filePath);
            totalFilenames.push(filename);

        })

    })

    return {totalFilenames, totalFilePaths};

} 

const uploadMedia = async(totalFilenames, totalFilePaths, userID) => {

    const totalURLs = [];

    for(let i = 0; i < totalFilePaths.length; i++) {

        let path = totalFilePaths[i];

        let fileContent;

        try {

            if (totalFilePaths[totalURLs.length].includes("/Messages/StickerCache") && !totalFilenames[totalURLs.length].includes(".gif")) {

                const newPath = await fixStickerMessage(totalFilePaths[totalURLs.length], totalFilenames[totalURLs.length]);
                path = newPath;

            }

            if (totalFilenames[totalURLs.length].includes("pluginPayloadAttachment")) {

                totalURLs.push("error");

            } else {

                fileContent = await readFile(path);
              
                const url = await uploadFile(totalFilenames[totalURLs.length], fileContent, userID)
                const currentFileName = totalFilenames[i];

                totalURLs.push(currentFileName);
            }

            

        } catch (e) {

            totalURLs.push("error");
            console.log("file_error", e);
        }

    }

    return totalURLs;

}

const findMessageByGuid = ((guid, messages) => {

    const messagesKeys = Object.keys(messages);

    const guidFixed = guid.split("/")[1];

    for(let i = 0; i < messagesKeys.length; i++) {

        const currentMessage = messages[messagesKeys[i]]

        const messageROWID = currentMessage.ROWID;
        const messageGUID = currentMessage.guid;

        if(messageGUID === guidFixed) {

            return messageROWID;
        }
    }

    return "";

})

const updateMessageROWID = (ROWID, messages, data) => {

    const reactionList = messages[ROWID].reactions;                 

    if (reactionList) {

        messages[ROWID].reactions[data.toString()] = data;
    
    } else {

        messages[ROWID].reactions = {};
        messages[ROWID].reactions[data.toString()] = data;
    }

    return messages;
}

const getUsernameByHandleID = (handleID, iMessageDB) => {

    if (handleID === 0) {

        return "Me";
    }

    const handles = iMessageDB.prepare(`SELECT * FROM handle WHERE ROWID=${handleID}`)
    const readHandles = handles.all();

    let username = readHandles[0].id;
    username = username.replace("+", "");

    return username;
}

const checkForSentMessage = (message,sentMessages) => {

    for(let i = 0; i < sentMessages.length; i++) {

        const currentSentMessage = sentMessages[i];
        
        if (currentSentMessage.key === message.ROWID) {

            return currentSentMessage.pushID;
        }
    } 

    return null;
}

const getMessagesByChatROWID = async(ROWID, userID, sentMessages, iMessageDB, saveKey) => {

    const newerMacOSVersion = parseInt(os.release().split(".")[0]) >= 18;

    if (ROWID === undefined || ROWID === null) {

        return {};
    }

    let chatJoinDB;
    let readChatJoinDB;

    let reverse = false; 
    
    if (saveKey === undefined || saveKey === null || saveKey === 0) {

        chatJoinDB = iMessageDB.prepare(`SELECT * FROM chat_message_join WHERE chat_id=${ROWID} ORDER BY message_id DESC LIMIT 50`);
        readChatJoinDB = chatJoinDB.all();
        readChatJoinDB = readChatJoinDB.reverse();

    } else {

        chatJoinDB = iMessageDB.prepare(`SELECT * FROM chat_message_join WHERE chat_id=${ROWID} AND message_id > ${saveKey}`);
        readChatJoinDB = chatJoinDB.all();
        reverse = true;

    }
    
   

    let messages = {}

    for(let i = 0; i < readChatJoinDB.length; i++) {

        const date_get = new Date();

        const chat_join = readChatJoinDB[i];

        //console.log("preprarring messages");
        const messageDB = iMessageDB.prepare(`SELECT * FROM message WHERE ROWID=${chat_join.message_id}`)
        const readMessageDB = messageDB.all();

        const messageROWID = readMessageDB[0].ROWID;
        const messageText = readMessageDB[0].text;
        const messageGUID = readMessageDB[0].guid;
        const messageIsRead= Boolean(readMessageDB[0].is_read);
        const messageIsDelivered = Boolean(readMessageDB[0].is_delivered);
        const messageIsSent = Boolean(readMessageDB[0].is_sent);
        const hasAttachment = readMessageDB[0].cache_has_attachments;
        const isFromMe = Boolean(readMessageDB[0].is_from_me);

        let assosicatedExpressionGuid = null;
        let assosicatedExpressionType = null;

        if (newerMacOSVersion) {

            assosicatedExpressionGuid = readMessageDB[0].associated_message_guid;
            assosicatedExpressionType = readMessageDB[0].associated_message_type;
        }
        
        const messageDate = readMessageDB[0].date;
        const serverDate = date_get.getTime();
        const handleID = readMessageDB[0].handle_id;

        //console.log("get_username_by_handleid");
        const from = getUsernameByHandleID(handleID, iMessageDB);
        let urls = [];
        let pictureSizes = [];

        //console.log("check_for_sent_meessage");
        let pushID = checkForSentMessage(readMessageDB[0], sentMessages);

        if (hasAttachment) {

            //console.log("get_picture_name");
            const {totalFilenames, totalFilePaths} = getPicturePathAndName(messageROWID, iMessageDB);
            //console.log("upload_media");
            const returnedFilsNames = await uploadMedia(totalFilenames, totalFilePaths, userID);
            //console.log("get_picture_size");
            pictureSizes = await getPictureSizes(totalFilePaths,messageROWID);
            //console.log("pic_sizes", typeof pictureSizes);
            urls = returnedFilsNames;
            
        }

         

        let isExpression = false;
        let assosicateROWID = null;
        if (assosicatedExpressionGuid && assosicatedExpressionType) {

            //console.log("find_message_by_guid");
            assosicateROWID = findMessageByGuid(assosicatedExpressionGuid, messages);

            //console.log("associate", assosicateROWID);
            if (assosicateROWID != ""){

                //console.log("update_expression");
                const updatedMessages = updateMessageROWID(assosicateROWID, messages, assosicatedExpressionType);
                messages = updatedMessages;

            }
            
            isExpression = true;
        }

        const newMessage = new Message();
        newMessage.ROWID = messageROWID;
        newMessage.text = messageText;
        newMessage.guid = messageGUID;
        newMessage.is_read = messageIsRead;
        newMessage.is_delivered = messageIsDelivered;
        newMessage.is_sent = messageIsSent;
        newMessage.filenames = urls;
        newMessage.is_from_me = isFromMe;
        newMessage.is_expression = isExpression;
        newMessage.expression_type = assosicatedExpressionType;
        newMessage.assoicate_guid = assosicatedExpressionGuid; 
        newMessage.assoicate_rowid = assosicateROWID;
        newMessage.date = messageDate;
        newMessage.parent_index = ROWID;
        newMessage.picture_sizes = pictureSizes;
        newMessage.server_date = serverDate;
        newMessage.from = from;
        newMessage.pushID = pushID;
       
        //messages.push(newMessage)

        // if (!assosicatedExpressionGuid && assosicatedExpressionType) {

           
        // }
         messages[messageROWID] = newMessage;
    }

    // readChatJoinDB.forEach(async(chat_join) => {

    //     const messageDB = iMessageDB.prepare(`SELECT * FROM message WHERE ROWID=${chat_join.message_id}`)
    //     const readMessageDB = messageDB.all();

    //     const messageROWID = readMessageDB[0].ROWID;
    //     const messageText = readMessageDB[0].text;
    //     const messageGUID = readMessageDB[0].guid;
    //     const messageIsRead= readMessageDB[0].is_read;
    //     const messageIsDelivered = readMessageDB[0].is_delivered;
    //     const messageIsSent = readMessageDB[0].is_sent;
    //     const hasAttachment = readMessageDB[0].cache_has_attachments;
    //     let urls = [];

    //     if (hasAttachment) {

    //         const {totalFilenames, totalFilePaths} = getPicturePathAndName(messageROWID);
    //         await uploadMedia(totalFilenames, totalFilePaths);
    //         urls = totalFilenames;
            
    //     }

    //     const newMessage = new Message();
    //     newMessage.ROWID = messageROWID;
    //     newMessage.text = messageText;
    //     newMessage.guid = messageGUID;
    //     newMessage.is_read = messageIsRead;
    //     newMessage.is_delivered = messageIsDelivered;
    //     newMessage.is_sent = messageIsSent;
    //     newMessage.filenames = "test";
       
    //     //messages.push(newMessage)
    //     messages[messageROWID] = newMessage;

    // });
    
    return messages;
}

const getNewMessages = (oldChatGuidAndMessage, newChatGuidAndMessage, chatGuidAndChat) => {

    const newUserMessageKeys = Object.keys(newChatGuidAndMessage);

    let messagesToAdd = {};

    newUserMessageKeys.forEach((userKey) => {

        const newMessages = newChatGuidAndMessage[userKey];
        const oldMessages = oldChatGuidAndMessage[userKey];

        const newMessageKeys = Object.keys(newMessages);

        let count = 0;
        newMessageKeys.forEach((messageKey) => {

            if (!oldMessages[messageKey]) {

                messagesToAdd[chatGuidAndChat[userKey].ROWID + "__" + count] = newMessages[messageKey];
                oldChatGuidAndMessage[userKey][messageKey] = newMessages[messageKey];
            }   
            
            count++;

        })
    })

    return {messagesToAdd, oldChatGuidAndMessage};
}

const getMessagesNeedingUpdate = (oldChatGuidAndMessage, newChatGuidAndMessage, chatGuidAndChat) => {


    let messagesNeedingUpdate = {}

    if (oldChatGuidAndMessage === undefined || oldChatGuidAndMessage === null || newChatGuidAndMessage === undefined || newChatGuidAndMessage === null || chatGuidAndChat === undefined || chatGuidAndChat === null) {

        return messagesNeedingUpdate;
    }

    const newUserMessageKeys = Object.keys(oldChatGuidAndMessage);

    let oldMessages;

    newUserMessageKeys.forEach((userKey) => {

        const newMessages = newChatGuidAndMessage[userKey];
        oldMessages = oldChatGuidAndMessage[userKey];

        const newMessageKeys = Object.keys(newMessages);
        const oldMessageKeys = Object.keys(oldMessages);

       

        let count = 0;
        oldMessageKeys.forEach((messageKey) => {

            if (oldMessages[messageKey] && newMessages[messageKey]) {

                if (oldMessages[messageKey].is_read !== newMessages[messageKey].is_read) {

                    messagesNeedingUpdate[chatGuidAndChat[userKey].ROWID + "__" + count] = newMessages[messageKey];
    
                } else if (oldMessages[messageKey].is_delivered !== newMessages[messageKey].is_delivered) {
    
                    messagesNeedingUpdate[chatGuidAndChat[userKey].ROWID + "__" + count] = newMessages[messageKey];
    
                } else if (oldMessages[messageKey].is_sent !== newMessages[messageKey].is_sent) {
    
                    messagesNeedingUpdate[chatGuidAndChat[userKey].ROWID + "__" + count] = newMessages[messageKey];
                }

                oldMessages[messageKey].is_read = newMessages[messageKey].is_read;
                oldMessages[messageKey].is_delivered = newMessages[messageKey].is_delivered
                oldMessages[messageKey].is_sent !== newMessages[messageKey].is_sent
                
    
                count++;

            }

            
        })

        oldChatGuidAndMessage[userKey] = oldMessages;

    })

    return {messagesNeedingUpdate, oldChatGuidAndMessage};

}

const findNewMessage = async(lastMessage, chatROWID) => {

    const findLimit = 13;
    let count = 0;

    while (findLimit > count) {

        const newMessageOfChat = getLastMessageByChatROWID(chatROWID);

        if (JSON.stringify(lastMessage) !== JSON.stringify(newMessageOfChat)) {

            console.log("new message!");
            return newMessageOfChat;
        } else {
            console.log("no new message");
            console.log("newChat", newMessageOfChat);
            console.log("oldChat", lastMessage);
        }

        await sleep(4000);
        count++;

    }

    throw new Error("Did not find message");
}

module.exports = {
    getChats,
    getMessagesByChatROWID,
    getLastMessageROWID,
    getMessagesNeedingUpdate,
    getNewMessages,
    findMessageByGuid,
    getLastMessageByChatROWID,
    getChatHandleJoin,
    getChatUsers,
    getPicturePathAndName, 
    findNewMessage,
    getLastRecordProperties
}