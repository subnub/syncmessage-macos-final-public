require("./config");

const database = firebase.database();
const storage = firebase.storage();

const uploadedFiles = {};
// Checks if we already uploaded a file in this session.

const uploadFirebase = async(chatDict, messageDict, userID) => {

    return new Promise((resolve, reject) => {

        try {

            const keys = Object.keys(chatDict);

            let counter = 0; 
        
            keys.forEach((key) => {
        
                database.ref().child("Profiles").child(userID).child("Users").child(chatDict[key].ROWID).set(chatDict[key]);
                database.ref().child("Profiles").child(userID).child("Messages").child(chatDict[key].ROWID).set(messageDict[key]);
        
                counter++;
            })

            resolve();

        } catch(error) {

            reject(error);
        }
        
    })

   
}

const tryDownloadURL = ((filename, userID) => {

    return new Promise((resolve, reject) => {

        storage.ref().child("Profiles").child(userID).child("attachments").child(filename).getDownloadURL().then((url) => {

            uploadedFiles[filename] = url;
            resolve(url);
        }).catch((e) => {

            reject(e);
        })
    })
})

const uploadFileIndividual = ((filename, content, userID) => {

    return new Promise((resolve, reject) => {


        storage.ref().child("Profiles").child(userID).child("attachments").child(filename).put(content).then(function(snapshot) {
    
            snapshot.ref.getDownloadURL().then(function(url) {

                uploadedFiles[filename] = url;
                resolve(url);
                
            }).catch((e) => {

                reject(e);
            })

        }).catch((e) => {

            reject(e);
        });

    })
})

const uploadFile = async(filename, content, userID) => {

    const uploadFilesKeys = Object.keys(uploadedFiles);

    for (let i = 0; i < uploadFilesKeys.length; i++) {

        const currentUploadedFileName = uploadFilesKeys[i];

        if (currentUploadedFileName === filename) {

            return(" ")
        }
        
    }

    try {

        const downloadURL = await tryDownloadURL(filename, userID)
        return downloadURL;
    } catch(e) {

        const indivFileUrl = await uploadFileIndividual(filename, content, userID);
        return indivFileUrl;
    }

    // return new Promise((resolve, reject) => {


    //     const uploadFilesKeys = Object.keys(uploadedFiles);

    //     console.log("upload file");
    //     console.log("uploadKeyLength", uploadFilesKeys.length);

    //     for (let i = 0; i < uploadFilesKeys.length; i++) {

    //         const currentUploadedFileName = uploadFilesKeys[i];

    //         if (currentUploadedFileName === filename) {

    //             console.log("file already uploaded", filename);
    //             resolve(" ")
    //         }
            
    //     }


    //     storage.ref().child("attachments").child(filename).getDownloadURL().then((url) => {

    //         console.log("found url", url);
    //         uploadedFiles[filename] = url;
    //         resolve(url);
    //     }).catch((e) => {

    //         console.log("no url", e);

    //         try {

    //             storage.ref().child("attachments").child(filename).put(content).then(function(snapshot) {
    
    //                 snapshot.ref.getDownloadURL().then(function(url) {
    
    //                     uploadedFiles[filename] = url;
    //                     resolve(url);
                        
    //                 }).catch((e) => {
    
    //                     reject(e);
    //                 })
    
    //             }).catch((e) => {
    
    //                 reject(e);
    //             });
            
    
    //         } catch (e) {
    
    //             reject(e);
    //         }
    //     })
        

        
        


    // })
}

module.exports = {uploadFirebase, uploadFile};
