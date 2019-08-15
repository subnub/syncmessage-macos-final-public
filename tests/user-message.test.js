const {getChats,getLastMessageROWID,getLastMessageByChatROWID,getChatHandleJoin,getChatUsers,getPicturePathAndName, findNewMessage} = require("../db_functions/db_functions");
const {readFile} = require("../utils/utils");
const {sendTextMessage, sendTextMessgeGroupChat} = require("../imessage_functions/imessage");

const staticChatROWID = 24;
const staticChatROWID2 = 47;
const staticMessageROWIDAttachment = 1508;
const staticMessageGuid = "78ADD4B3-C57A-44D1-8EBB-6AB653913859";
const staticFileName = "/private/var/folders/3z/nrh0lj6xg32qfgl3_mk0fc0000gn/T/com.apple.iChat/Messages/Transfers/2aafca0.jpg";
let savedChatHandleJoin;
let savedPicturePath;
let savedChats;

test("Should Return User List", () => {

    const chats = getChats();

    if (chats === undefined || chats === null) {

        throw new Error("No Chats");
    }

    if (chats.length === 0) {

        throw new Error("No Chats");
    }

    const chatKeys = Object.keys(chats);

    if (chats[chatKeys[0]].ROWID.length === 0) {

        throw new Error("Blank Chat Data");
    }

    savedChats = chats;


});

test("Should get last message ROWID", () => {

    const lastROWID = getLastMessageROWID();

    if (lastROWID === undefined || lastROWID === null) {

        throw new Error("Cannot get last message ROWID")
    }

    if (getLastMessageROWID === 0) {

        throw new Error("No First ROWID");
    }


})

test("Should get last message by chat ROWID", () => {


    const lastMessage = getLastMessageByChatROWID(staticChatROWID);

    if (lastMessage.text === undefined || lastMessage.text === null) {

        throw new Error("Cannot get last message by chatROWID");
    }

})

test("Should get chat handle join by chat ROWID", () => {

    const chatHandleJoin = getChatHandleJoin(staticChatROWID);

    if (chatHandleJoin === undefined || chatHandleJoin === null) {

        throw new Error("Cannot get chat handle join");
    }

    if (chatHandleJoin.length === 0) {

        throw new Error("Cannot get chat handle join");
    }

    savedChatHandleJoin = chatHandleJoin;    
})

test("Should get chat users, by chat handle join", () => {

    const chatUsers = getChatUsers(savedChatHandleJoin);

    if (chatUsers === undefined || chatUsers === null) {

        throw new Error("Cannot get chat users by chat handle join");
    }

    if (chatUsers.length === 0) {

        throw new Error("Cannot get chat users by chat handle join");
    }

})

test("Should get picture paths by ROWID", () => {

    const picturePathsAndName = getPicturePathAndName(staticMessageROWIDAttachment);

    savedPicturePath = picturePathsAndName.totalFilePaths[0];

    if (picturePathsAndName === undefined || picturePathsAndName === null) {

        throw new Error("Cannot get picture paths by ROWID");
    }

})

test("Should Read File", async() => {

    
    const file = await readFile(savedPicturePath);

    if (file === undefined || file === null) {

        throw new Error("Cannot get file");
    }

});

test("Should not be able to read file", async() => {

    try {

        const file = await readFile("sdfsdfsf.jpg");
        throw new Error("Found file when wasnt suppose to");
    } catch(e) {

    }
}) 

test("Should send text message and find message", async() => {

    const message = await sendTextMessage("waterspart71197@live.com", "test");
    
    const lastMessageOfChat = getLastMessageByChatROWID(staticChatROWID2);

    const foundMessage = findNewMessage(lastMessageOfChat, staticChatROWID2);


})

// test("Should send image message and find message", async() => {

//     const newMessage = {};
//     newMessage.filename = staticFileName;

//     newMessage.username, newMessage, userID
//     const message = await sendImageMessage("waterspart71197@live.com", );
// })

test("Should send groupchat text message and find message", async() => {

    const message = await sendTextMessgeGroupChat("iMessage;+;chat654041194912515748", "test");
    
    const lastMessageOfChat = getLastMessageByChatROWID(staticChatROWID);

    const foundMessage = findNewMessage(lastMessageOfChat, staticChatROWID);


})

