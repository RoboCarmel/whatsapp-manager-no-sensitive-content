const express = require("express");
const cors = require("cors");
const qrcode = require("qrcode");
const path = require("path");
const { Client, LocalAuth, Poll, Location, MessageMedia } = require("whatsapp-web.js");
const { saveChatSelections, getChatSelections, getChats, getMainChat, getMessageEnding } = require("./firebase_server");
const TelegramBot = require("node-telegram-bot-api");
const {
    saveUserTelegramChatId,
    saveUserTelegramChats,
    getUserTelegramChats,
    assignBotToUser,
    getSuffix,
} = require("./firebase_server");
// const { console } = require("inspector");
const util = require("util");
// Override console.log to force logs to stdout
console.log = (...args) => process.stdout.write(util.format(...args) + "\n");
console.error = (...args) => process.stderr.write(util.format(...args) + "\n");

const app = express();
app.use(express.json());
app.use(cors({
    origin: "https://whatsapp-manager-b0fb8.web.app"
}));

console.log("updated server");
const sessions = {}; // Store user sessions



// Sleep function to introduce delays
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// messages classes

class Message {
    constructor(firebaseUid, message) {
        this.firebaseUid = firebaseUid;
        this.message = message;
        this.client = sessions[firebaseUid];

        if (!this.client) {
            throw new Error(` No active session found for user ${firebaseUid}`);
        }
    }

    //  Retrieve referenced message if available (Decorator-like functionality)
    

    async forward(userSelections, userBot, telegramChats) {
        throw new Error("Forward method not implemented");
    }
    async deleteMessage(userSelections, userBot, telegramChats) {
        throw new Error("Delete method not implemented");
    }
}

async function getQuotedMessageOptions(firebaseUid, message, targetChatId) {
    try {
        if (!message.hasQuotedMsg) return {}; //  No reference, return empty options

        const quotedMessage = await message.getQuotedMessage(); //  Retrieve the referenced message
        console.log(`🔗 Referencing message: "${quotedMessage.body}" with timestamp: ${quotedMessage.timestamp}`);

        //  Lookup the referenced message in messageMappingWhatsapp using timestamp
        const forwardedMessages = usersMessageMappingWhatsapp[firebaseUid].get(quotedMessage.timestamp);

        if (forwardedMessages) {
            const correspondingMessage = forwardedMessages.find(m => m.to === targetChatId);

            if (correspondingMessage) {
                console.log(`Found referenced message in ${targetChatId}`);
                return { quotedMessageId: correspondingMessage.id._serialized }; //  Correct reference applied
            } else {
                console.warn(`Referenced message not found in ${targetChatId}, but exists in mapping.`);
            }
        } else {
            console.warn(`No forwarded message mapping found for timestamp ${quotedMessage.timestamp}`);
        }

        return {}; // Return empty if no reference found
    } catch (error) {
        console.error(`Error handling referenced message:`, error);
        return {};
    }
}



class BasicMessage extends Message {
    async forward(userSelections, userBot, telegramChats) {
        console.log(`Forwarding basic message: "${this.message.body || "[Media]"}"`);
        let whatsappMessageList = [];
        const suffix = await getSuffix(this.firebaseUid);
        const finalBody = (this.message.body || "") + (suffix ? `\n\n${suffix}` : "");

        for (const chatId of userSelections.targetChats) {
            const referenceOptions = await getQuotedMessageOptions(this.firebaseUid, this.message, chatId); //  Get reference
            let sentMessage = null;

            if (this.message.hasMedia) {
                try {
                    console.log(`📷 Downloading media from message...`);
                    const media = await this.message.downloadMedia();
                    const randomDelay = Math.floor(Math.random() * 500) + 2000; // 2000 - 25000 ms
                    await sleep(randomDelay);
                    sentMessage =await this.client.sendMessage(chatId, media, {
                        caption: finalBody,
                        ...referenceOptions, //  Attach reference if available
                    });
                    console.log(` Forwarded media message to ${chatId}`);
                } catch (error) {
                    console.error(` Error downloading/sending media:`, error);
                }
            } else {
                //  Random delay (1-2 seconds) before processing
                const randomDelay = Math.floor(Math.random() * 1000) + 1000; // 1000 - 2000 ms
                await sleep(randomDelay);

                sentMessage = await this.client.sendMessage(chatId, finalBody, { ...referenceOptions, linkPreview: false }); //  Forward text with reference
                console.log(`Forwarded text message to ${chatId}`);
            }
            whatsappMessageList.push(sentMessage);
        }
        usersMessageMappingWhatsapp[this.firebaseUid].set(this.message.timestamp, whatsappMessageList); //  Store mapping for WhatsApp

        if (userBot && telegramChats.length !== 0) {
            const retrySend = async (sendFn, maxRetries = 1, delayMs = 1000) => {
                for (let i = 0; i <= maxRetries; i++) {
                  try {
                    return await sendFn();
                  } catch (error) {
                    if (i === maxRetries) throw error;
                    console.warn(` Retry ${i + 1} failed:`, error.message);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                  }
                }
              };
            let telegramMessageList = [];
        
            for (const chat of telegramChats) {
                //  Random delay (1-2 seconds) before processing
                const randomDelay = Math.floor(Math.random() * 1000) + 1000; // 1000 - 2000 ms
                await sleep(randomDelay);
                let sentMessage = null;
        
                if (this.message.hasMedia) {
                    const media = await this.message.downloadMedia();
                    
                    // Determine media type
                    if (media.mimetype.startsWith("image/")) {
                        sentMessage = await retrySend(() =>  userBot.sendPhoto(chat.chatId, Buffer.from(media.data, "base64"), {
                            caption: finalBody,
                            filename: "image.jpg", 
                        }));
                        console.log(` Forwarded image to Telegram chat: ${chat.chatId}`);
                    } else if (media.mimetype.startsWith("video/")) {
                        sentMessage = await userBot.sendVideo(chat.chatId, Buffer.from(media.data, "base64"), {
                            caption: finalBody,
                            filename: "video.mp4", 

                        });
                        console.log(` Forwarded video to Telegram chat: ${chat.chatId}`);
                    } else {
                        console.log(`Unsupported media type: ${this.message.mimetype}`);
                        continue; // Skip unsupported media types
                    }
                } else {
                    sentMessage = await userBot.sendMessage(chat.chatId, finalBody);
                    console.log(`Forwarded text to Telegram chat: ${chat.chatId}`);
                }
        
                // Store message details in messageMapping
                telegramMessageList.push({ chatId: chat.chatId, messageId: sentMessage.message_id });
                
                
                console.log(`Message ID: ${this.message.id.id}`);
            }
            usersMessageMappingTelegram[this.firebaseUid].set(this.message.timestamp, telegramMessageList); //  Store mapping for Telegram
        }
        

    }
}





class LocationMessage extends Message {
    async forward(userSelections, userBot, telegramChats) {
        if (!this.message.location) {
            console.error(`Message does not contain a location.`);
            return;
        }

        console.log(` Forwarding location...`);
        console.log(this.message)
        const { latitude, longitude } = this.message.location;
        const locationMessage = `https://www.google.com/maps?q=${latitude},${longitude}`;
        let whatsappMessageList = [];


        for (const chatId of userSelections.targetChats) {
            const referenceOptions = await getQuotedMessageOptions(this.firebaseUid, this.message, chatId); // Get reference
            //  Random delay (1-2 seconds) before processing
            const randomDelay = Math.floor(Math.random() * 1000) + 1000; // 1000 - 2000 ms
            await sleep(randomDelay);
            const sentMessage = await this.client.sendMessage(chatId, locationMessage, referenceOptions); // Attach referenced message if available

            whatsappMessageList.push(sentMessage);
            console.log(`Sent location to ${chatId} with reference.`);
        }
        usersMessageMappingWhatsapp[this.firebaseUid].set(this.message.timestamp, whatsappMessageList); // Store mapping for WhatsApp

        if (userBot && telegramChats.length !== 0) {
            let telegramMessageList = [];

            for (const chat of telegramChats) {
                 //  Random delay (1-2 seconds) before processing
                const randomDelay = Math.floor(Math.random() * 1000) + 1000; // 1000 - 2000 ms
                await sleep(randomDelay);
                const sentMessage = await userBot.sendMessage(chat.chatId, locationMessage);

                telegramMessageList.push({ chatId: chat.chatId, messageId: sentMessage.message_id });
                console.log(` Sent location to Telegram chat: ${chat.chatId}`);
            }

            usersMessageMappingTelegram[this.firebaseUid].set(this.message.timestamp, telegramMessageList); // Store mapping for Telegram
        }

    }
}

class PollMessage extends Message {
    async forward(userSelections, userBot, telegramChats) {
        if (this.message.type !== "poll_creation") {
            console.error(`❌ Message is not a poll creation.`);
            return;
        }

        console.log(` Forwarding poll...`);
        console.log("allowMultipleAnswers:", this.message.allowMultipleAnswers);
        const allowMultipleAnswers = this.message.allowMultipleAnswers ?? false; // Default to false if undefined

        let whatsappMessageList = [];

        for (const chatId of userSelections.targetChats) {
            const referenceOptions = await getQuotedMessageOptions(this.firebaseUid, this.message, chatId); //  Get reference
            //  Random delay (1-2 seconds) before processing
            const randomDelay = Math.floor(Math.random() * 1000) + 1000; // 1000 - 2000 ms
            await sleep(randomDelay);
            const poll = new Poll(this.message.pollName, this.message.pollOptions.map(option => option.name), {
                allowMultipleAnswers: allowMultipleAnswers
            });

            console.log(` Sending poll to WhatsApp chat: ${chatId}`);
            const sentMessage = await this.client.sendMessage(chatId, poll, referenceOptions); // Attach referenced message if available
            
            // Store mapping: original timestamp → forwarded message details
            whatsappMessageList.push(sentMessage);
            console.log(` Forwarded poll to ${chatId} with reference.`);
        }

        usersMessageMappingWhatsapp[this.firebaseUid].set(this.message.timestamp, whatsappMessageList); //  Store mapping for WhatsApp

        if (userBot && telegramChats.length !== 0) {
            let telegramMessageList = [];

            for (const chat of telegramChats) {
                 //  Random delay (1-2 seconds) before processing
                const randomDelay = Math.floor(Math.random() * 1000) + 1000; // 1000 - 2000 ms
                await sleep(randomDelay);
                const pollOptions = this.message.pollOptions.map(option => option.name); // Extract names only
                console.log(pollOptions);
                const sentMessage = await userBot.sendPoll(chat.chatId, this.message.pollName, pollOptions, {
                    is_anonymous: true, 
                    allows_multiple_answers: allowMultipleAnswers
                });

                telegramMessageList.push({ chatId: chat.chatId, messageId: sentMessage.message_id });
                console.log(`Forwarded poll to Telegram chat: ${chat.chatId}`);
            }

            usersMessageMappingTelegram[this.firebaseUid].set(this.message.timestamp, telegramMessageList); //  Store mapping for Telegram
        }
    }
}


class VCardMessage extends Message {
    async forward(userSelections, userBot, telegramChats) {
        if (this.message.type !== "vcard") {
            console.error(` Message is not a vCard.`);
            return;
        }

        const vCardData = this.message.body;

        //  Extract contact name (if available)
        const contactNameMatch = vCardData.match(/FN:(.*)/);
        const contactName = contactNameMatch ? contactNameMatch[1] : "Unknown Contact";

        console.log(`Forwarding vCard: "${contactName}" to target chats...`);
        let whatsappMessageList = [];
        const contactIdMatch = vCardData.match(/TEL;type=Mobile;waid=(\d+)/);
        const contactId = contactIdMatch ? contactIdMatch[1] : null;

        if (!contactId) {
            console.error(" No valid WhatsApp ID found in vCard.");
        } else {
            console.log(` Extracted Contact ID: ${contactId}`);

        // Fetch the contact object using the extracted ID
        const contactOne = await this.client.getContactById(`${contactId}@c.us`);

        console.log(`Retrieved contact: ${contactOne.pushname || "Unknown Contact"}`);


        for (const chatId of userSelections.targetChats) {
            const referenceOptions = await getQuotedMessageOptions(this.firebaseUid, this.message, chatId); // Get reference
            //  Random delay (1-2 seconds) before processing
            const randomDelay = Math.floor(Math.random() * 1000) + 1000; // 1000 - 2000 ms
            await sleep(randomDelay);
            const sentMessage = await this.client.sendMessage(chatId, contactOne, referenceOptions);
            
            whatsappMessageList.push(sentMessage);

            console.log(` Forwarded vCard "${contactName}" to ${chatId} with reference.`);
        }
        usersMessageMappingWhatsapp[this.firebaseUid].set(this.message.timestamp, whatsappMessageList); // ✅ Store mapping for WhatsApp

    }
}
}


const messageQueues = {};
const processingLocks = {}; // Track if a message is being processed for each user
const deleteQueues = {};

const processNextMessage = async (firebaseUid) => {
    if (!messageQueues[firebaseUid] || messageQueues[firebaseUid].length === 0) {
        processingLocks[firebaseUid] = false; // Unlock processing
        processNextDeletion(firebaseUid); // After sending, check for deletions
        return;
    }

    if (processingLocks[firebaseUid]) return; // Ensure only one message is processed at a time
    processingLocks[firebaseUid] = true; // Lock processing

    const userSelections = await getChatSelections(firebaseUid);
    const message = messageQueues[firebaseUid].shift(); // Get next message

    try {
        let messageInstance;
        switch (message.type) {
            case "location":
                messageInstance = new LocationMessage(firebaseUid, message);
                break;
            case "poll_creation":
                messageInstance = new PollMessage(firebaseUid, message);
                break;
            case "vcard":
                messageInstance = new VCardMessage(firebaseUid, message);
                break;
            default:
                messageInstance = new BasicMessage(firebaseUid, message);
        }

        //  Forward the message
        const userBot = userBots[firebaseUid];
        let telegramChats = [];
        if (userBot) {
            telegramChats = await getUserTelegramChats(firebaseUid);
        }
        await messageInstance.forward(userSelections, userBot, telegramChats);
    } catch (error) {
        console.error(` Error processing message for ${firebaseUid}:`, error);
    }

    // Process the next message after 15 seconds
    setTimeout(() => {
        processingLocks[firebaseUid] = false; // Unlock for next message
        processNextMessage(firebaseUid);
    }, Math.floor(Math.random() * 2000) + 13000);
};


const processNextDeletion = async (firebaseUid) => {
    while (messageQueues[firebaseUid].length > 0 || processingLocks[firebaseUid]) {
        console.log(` Waiting to start deletions for ${firebaseUid}...`);
        await sleep(2000); // Poll every 2 seconds
    }
    if (!deleteQueues[firebaseUid] || deleteQueues[firebaseUid].length === 0) return;

    if (processingLocks[firebaseUid]) {
        console.log(` Delaying deletion for ${firebaseUid} since messages are still being sent.`);
        return;
    }

    processingLocks[firebaseUid] = true; // Lock processing to handle deletion first
    const userSelections = await getChatSelections(firebaseUid);
    const deleteRequest = deleteQueues[firebaseUid].shift(); // Get next deletion request

    try {
        console.log(`🗑 Processing deletion: ${deleteRequest.before.body}`);

        //  Delete from WhatsApp
        await deleteForwardedWhatsappMessage(deleteRequest.before.timestamp, firebaseUid);

        //  Delete from Telegram
        if (deleteRequest.before.type !== "vcard") {
            await deleteForwardedTelegramMessage(deleteRequest.before.timestamp, firebaseUid);
        }

    } catch (error) {
        console.error(` Error deleting message for ${firebaseUid}:`, error);
    }

    // Process the next deletion after 3-5 seconds
    setTimeout(() => {
        processingLocks[firebaseUid] = false; // Unlock for next deletion
        processNextDeletion(firebaseUid);
    }, Math.floor(Math.random() * 2000) + 3000);
};


const listenForMessages = (firebaseUid) => {
    const client = sessions[firebaseUid];
    process.stdout.write(" Logging to stdout\n");
    console.log(" Server.js is running...");
    if (!usersMessageMappingWhatsapp[firebaseUid]){
        usersMessageMappingWhatsapp[firebaseUid] = new Map();
        usersMessageMappingTelegram[firebaseUid] = new Map();
    }

    

    if (!client) {
        console.error(` Error: No active session found for user ${firebaseUid}`);
        return;
    }
    // Prevent multiple event listeners
    if (activeListeners[firebaseUid]) {
        console.log(` Listener already active for user: ${firebaseUid}`);
        return;
    }

    activeListeners[firebaseUid] = true; // Mark listener as active
    messageQueues[firebaseUid] = [];
    deleteQueues[firebaseUid] = [];
    processingLocks[firebaseUid] = false; // Initialize processing lock

    console.log(`Listening for messages for user: ${firebaseUid}`);

    client.on("message_create", async (message) => {
        try {
            if (!message.fromMe) return;

            const userSelections = await getChatSelections(firebaseUid);
            if (!userSelections || message.to !== userSelections.mainChat) return;

            console.log(` Queued message: ${message.type}`);
            messageQueues[firebaseUid].push(message);

            // Start processing only if no message is currently being processed
            if (!processingLocks[firebaseUid]) {
                processNextMessage(firebaseUid);
            }
        } catch (error) {
            console.error(` Error processing message for ${firebaseUid}:`, error);
        }
    });

    client.on("disconnected", async (reason) => {
        console.error(`WhatsApp Web disconnected for ${firebaseUid}: ${reason}`);
        await restartSession(firebaseUid, hardReset = true);
    });

    client.on("message_revoke_everyone", async (after, before) => {
        try {
            if (!before || !before.fromMe) return;

            const userSelections = await getChatSelections(firebaseUid);
            if (!userSelections || before.to !== userSelections.mainChat) return;

            console.log(` Queued deletion for: "${before.body}"`);
            deleteQueues[firebaseUid].push({ before });

            if (!processingLocks[firebaseUid] && messageQueues[firebaseUid].length === 0) {
                processNextDeletion(firebaseUid);
            }
        } catch (error) {
            console.error(` Error deleting message for ${firebaseUid}:`, error);
        }
    });

};


//  Serve Static Files (Frontend)
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "auth.html"));
});

app.get("/sessions", async (req, res) => {
    try {
        const activeSessions = Object.keys(sessions).map(userId => ({
            userId,
            status: sessions[userId] ? "Connected" : "Disconnected"
        }));

        res.json({ success: true, sessions: activeSessions });
    } catch (error) {
        console.error(" Error fetching sessions:", error);
        res.status(500).json({ success: false, error: "Failed to fetch sessions." });
    }
});


app.get("/qr/:firebaseUid", async (req, res) => {
    const firebaseUid = req.params.firebaseUid;

    if (sessions[firebaseUid]) {
        if (sessions[firebaseUid].info) {
            return res.json({ message: "WhatsApp Web is already connected.", status: "connected" });
        }
        // else {
        //     console.log(` Existing session for ${firebaseUid} is disconnected. Restarting session...`);
        //     await restartSession(firebaseUid);
        // }
    } else {
        console.log(`Starting new WhatsApp session for user: ${firebaseUid} through QR`);

        const client = new Client({
            authStrategy: new LocalAuth({ clientId: firebaseUid }),
            puppeteer: {
                headless: true,
                executablePath: process.platform === "win32"
                ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
                : "/usr/bin/google-chrome-stable"
                    , // Use system Chrome         
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-gpu",
                    "--disable-software-rasterizer",
                    "--disable-dev-shm-usage",
                    "--disable-accelerated-2d-canvas",
                    "--disable-features=site-per-process"
                ]
            }
        });

        

        sessions[firebaseUid] = client;
        sessions[firebaseUid].qrStatus = "pending"; //  Default status

        client.on("qr", (qr) => {
            console.log(` Generated QR Code for ${firebaseUid}`);
            sessions[firebaseUid].qrCode = qr;
            sessions[firebaseUid].qrStatus = "available";
        });

        client.on("ready", async () => {
            console.log(`WhatsApp Web Connected for user: ${firebaseUid}`);
            sessions[firebaseUid].qrCode = null;
            sessions[firebaseUid].qrStatus = "connected";
        });

        // client.on("disconnected", async (reason) => {
        //     console.error(` WhatsApp Web disconnected for ${firebaseUid}: ${reason}`);
        //     await restartSession(firebaseUid, hardReset = true);
        // });

        try {
            client.initialize().then(() => {
                // Save the underlying Chrome process PID for this user
                const pid = client.pupBrowser?.process()?.pid;
                sessionPIDs[firebaseUid] = pid;
              });
        } catch (error) {
            console.error(`Error initializing WhatsApp Web for ${firebaseUid}:`, error);
            return res.status(500).json({ error: "Failed to start WhatsApp Web. Please try again." });
        }
    }

    //  Wait up to 10 seconds for QR status to update
    let attempts = 0;
    while (sessions[firebaseUid] && sessions[firebaseUid].qrStatus === "pending" && attempts < 20) {
        console.log(`⏳ Waiting for QR status... Attempt ${attempts + 1}`);
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
    }

    // Return QR code status
    if (sessions[firebaseUid] && sessions[firebaseUid].qrStatus === "available") {
        return res.json({ qr: sessions[firebaseUid].qrCode, status: "available" });
    } else if (sessions[firebaseUid] && sessions[firebaseUid].qrStatus === "connected") {
        return res.json({ message: "WhatsApp Web is already connected.", status: "connected" });
    } else {
        return res.json({ message: "QR Code not available yet. Try again.", status: "pending" });
    }
});




//  Start listening for deletions after WhatsApp connects
app.get("/start-listening-deletions/:firebaseUid", async (req, res) => {
    const { firebaseUid } = req.params;
    console.log(`🔄 Enabling message deletion listening for user: ${firebaseUid}`);

    if (sessions[firebaseUid]) {
        listenForDeletions(firebaseUid);
        return res.json({ success: true, message: "Message deletion tracking enabled!" });
    } else {
        return res.status(400).json({ error: "User is not connected to WhatsApp." });
    }
});


//  Start listening for messages after WhatsApp connects
app.get("/start-listening/:firebaseUid", async (req, res) => {
    const { firebaseUid } = req.params;
    console.log(` Enabling message listening for user: ${firebaseUid}`);

    if (sessions[firebaseUid]) {
        listenForMessages(firebaseUid);
        return res.json({ success: true, message: "Message forwarding enabled!" });
    } else {
        return res.status(400).json({ error: "User is not connected to WhatsApp." });
    }
});


app.get("/chats/:firebaseUid", async (req, res) => {
    const { firebaseUid } = req.params;
    console.log(`Fetching chats for user: ${firebaseUid}`);

    if (!sessions[firebaseUid]) {
        console.log(" User not connected to WhatsApp.");
        return res.status(400).json({ error: "User is not connected to WhatsApp. Please scan the QR code first." });
    }

    try {
        console.log(`we try`);
        //console.log(sessions[firebaseUid]);
        const chats = await sessions[firebaseUid].getChats();
        const limitedChats = chats.slice(0, 100); // Limit to first 100 chats

        const formattedChats = limitedChats.map(chat => ({
            id: chat.id._serialized,
            name: chat.name || chat.id.user
        }));

        console.log(` Successfully fetched ${formattedChats.length} chats for user ${firebaseUid}`);
        res.json({ success: true, chats: formattedChats });
    } catch (error) {
        console.error(`❌ Error fetching chats for ${firebaseUid}:`, error);
        restartSession(firebaseUid);
        res.status(500).json({ error: "Failed to fetch chats" });
    }
});



app.post("/save-chats/:firebaseUid", async (req, res) => {
    const { firebaseUid } = req.params;
    const { mainChat, targetChats } = req.body;

    console.log(` Saving chats for user: ${firebaseUid}`);
    console.log(" Main Chat:", mainChat);
    console.log(" Target Chats:", targetChats);

    try {
        await saveChatSelections(firebaseUid, mainChat, targetChats);
        await getUserBot(firebaseUid);

        // Automatically start message listening after saving selections
        listenForMessages(firebaseUid);
      //  listenForDeletions(firebaseUid);

        res.json({ success: true, message: "Chat selections saved and message listening started!" });
    } catch (error) {
        console.error(` Error saving chats for ${firebaseUid}:`, error);
        res.status(500).json({ error: "Failed to save chat selections." });
    }
});

const restartSession = async (firebaseUid, hardReset = false) => {
    console.log(` Restarting WhatsApp session for user: ${firebaseUid}`);
    console.log(`Hard reset: ${hardReset}`);

    // 1. Kill old Chrome if needed
    if (hardReset && sessionPIDs[firebaseUid]) {
        try {
            process.kill(sessionPIDs[firebaseUid]);
            console.log(`Killed Chrome process for ${firebaseUid}`);
        } catch (e) {
            console.warn(` Failed to kill Chrome for ${firebaseUid}:`, e.message);
        }
    }

    // 2. Destroy old WhatsApp client
    if (sessions[firebaseUid]) {
        try {
            console.log(`Closing existing session for ${firebaseUid}`);
            sessions[firebaseUid].removeAllListeners?.();
            await sessions[firebaseUid].destroy();
            console.log(`Destroyed existing session for ${firebaseUid}`);
        } catch (error) {
            if (error.message && error.message.includes("Target closed")) {
                console.warn(`⚠️ Browser already closed for ${firebaseUid}`);
            } else {
                console.error(`Error during destroy for ${firebaseUid}:`, error.message);
            }
        }
    }

    //  3. Clean up memory
    sessionPIDs[firebaseUid] = null;
    activeListeners[firebaseUid] = false;
    messageQueues[firebaseUid] = [];
    deleteQueues[firebaseUid] = [];
    processingLocks[firebaseUid] = false;
    usersMessageMappingTelegram[firebaseUid] = new Map();
    usersMessageMappingWhatsapp[firebaseUid] = new Map();
    sessions[firebaseUid] = null;

    //  4. Wait to fully release old Chrome resources
    console.log(`Waiting 5 seconds to release Chrome resources...`);
    await sleep(5000);

    //  5. Create a new WhatsApp Client
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: firebaseUid }),
        puppeteer: {
            headless: true,
            executablePath: process.platform === "win32"
                ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
                : "/usr/bin/google-chrome-stable",
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-gpu",
                "--disable-software-rasterizer",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--disable-features=site-per-process",
            ],
        },
    });

    sessions[firebaseUid] = client;

    client.on("qr", (qr) => {
        console.log(`New QR code generated for ${firebaseUid}`);
        sessions[firebaseUid].qrCode = qr;
    });

    client.on("ready", () => {
        console.log(` WhatsApp Web ready for ${firebaseUid}`);
        sessions[firebaseUid].qrCode = null;
    });

    client.on("disconnected", async (reason) => {
        console.error(` WhatsApp Web disconnected for ${firebaseUid}: ${reason}`);
        await restartSession(firebaseUid, true); // full restart on disconnect
    });

    //  6. Try to initialize the new client with retry logic
    let initialized = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            console.log(` Initializing WhatsApp client (Attempt ${attempt})...`);
            await client.initialize();
            initialized = true;
            break;
        } catch (error) {
            console.error(` Failed to initialize WhatsApp client (Attempt ${attempt}):`, error.message);
            if (attempt < 2) {
                console.log(` Waiting 5 seconds before retrying...`);
                await sleep(5000);
            }
        }
    }

    if (!initialized) {
        console.error(`❌ Could not initialize WhatsApp client for ${firebaseUid} after retries.`);
        return;
    }

    // 7. Save Chrome process PID
    const pid = client.pupBrowser?.process()?.pid;
    sessionPIDs[firebaseUid] = pid;
    console.log(` Chrome PID saved for ${firebaseUid}: ${pid}`);

    
};


app.get("/check-session/:firebaseUid", (req, res) => {
    const { firebaseUid } = req.params;
    const isActive = !!sessions[firebaseUid];

    res.json({ success: true, isActive });
});


// Listen for session disconnections
app.get("/restart-session/:firebaseUid", async (req, res) => {
    const { firebaseUid } = req.params;
    console.log(`Manual session restart requested for ${firebaseUid}`);
    await restartSession(firebaseUid);
    res.json({ success: true, message: "Session restarted successfully." });
});





/// Telegram


const userBots = {}; // Store user-specific Telegram bot instances
const activeListeners = {}; // { firebaseUid: true/false }
const usersMessageMappingTelegram = {};  // { WhatsApp Message timestamp → [{ chatId, messageId }, { chatId, messageId }, ...] }
const usersMessageMappingWhatsapp = {};  // { WhatsApp Message timestamp → [  message , message ...] }
const sessionPIDs = {};// { firebaseUid: pids for puppeteer}



// Retrieve and initialize the Telegram bot for a user
async function getUserBot(firebaseUid) {
    for (const it in userBots) {
        console.log(userBots[it]);
    }
    if (userBots[firebaseUid]) {
        console.log(` Telegram bot for ${firebaseUid} is already running.`);
        return userBots[firebaseUid];
    }

    const botInfo = await assignBotToUser(firebaseUid);
    if (!botInfo || !botInfo.botToken) {
        console.log(`No Telegram bot token found for user: ${firebaseUid}`);
        return null;
    }

    console.log(`Initializing new Telegram bot for ${firebaseUid}`);
    const bot = new TelegramBot(botInfo.botToken, { polling: true });

    // Store the bot instance to prevent duplication
    userBots[firebaseUid] = bot;
    

    // Ensure "message" event listener is only attached once
    bot.on("message", async (msg) => {
        const chatId = msg.chat.id;
        const chatName = msg.chat.title || msg.chat.username || msg.chat.first_name;

        console.log(` Detected new chat: ${chatName} (ID: ${chatId})`);

        await saveUserTelegramChats(firebaseUid, chatId, chatName);
        console.log(` Saved chat ${chatName} (${chatId}) to Firestore`);
    });

    // Handle polling errors gracefully
    bot.on("polling_error", (error) => {
        console.error(` Telegram polling error for ${firebaseUid}:`, error.message);
    });

    return bot;
}



// Store Telegram chat ID when user sends /start
app.post("/register-telegram-chat/:firebaseUid", async (req, res) => {
    const { firebaseUid } = req.params;
    const { chatId } = req.body;

    try {
        await saveUserTelegramChatId(firebaseUid, chatId);
        res.json({ success: true, message: "Telegram chat ID registered!" });
    } catch (error) {
        res.status(500).json({ error: "Failed to save Telegram chat ID." });
    }
});

// Store selected Telegram chats for forwarding
app.post("/save-telegram-chats/:firebaseUid", async (req, res) => {
    const { firebaseUid } = req.params;
    const { selectedChats } = req.body;

    try {
        await saveUserTelegramChats(firebaseUid, selectedChats);
        res.json({ success: true, message: "Telegram target chats saved!" });
    } catch (error) {
        res.status(500).json({ error: "Failed to save Telegram target chats." });
    }
});

app.get("/get-telegram-chats/:firebaseUid", async (req, res) => {
    const { firebaseUid } = req.params;

    try {
        const chats = await getUserTelegramChats(firebaseUid);
        res.json({ success: true, chats });
    } catch (error) {
        console.error(`Error retrieving chats for ${firebaseUid}:`, error);
        res.status(500).json({ error: "Failed to retrieve Telegram chats." });
    }
});

app.get("/get-user-bot/:firebaseUid", async (req, res) => {
    const { firebaseUid } = req.params;

    try {
        const botInfo = await assignBotToUser(firebaseUid);
        res.json({ success: true, botToken: botInfo.botToken, botName: botInfo.botName });
    } catch (error) {
        console.error(`Error assigning bot for ${firebaseUid}:`, error);
        res.status(500).json({ error: "Failed to assign bot." });
    }
});
async function deleteForwardedTelegramMessage(whatsappMessageId, firebaseUid) {
    const messageList = usersMessageMappingTelegram[firebaseUid].get(whatsappMessageId);

    if (!messageList || messageList.length === 0) {
        console.log(`⚠️ No matching Telegram messages found for WhatsApp Message ID: ${whatsappMessageId}`);
        return;
    }

    try {
        for (const { chatId, messageId } of messageList) {
            //  Random delay (1-2 seconds) before processing
            const randomDelay = Math.floor(Math.random() * 1000) + 1000; // 1000 - 2000 ms
            await sleep(randomDelay);
            await userBots[firebaseUid].deleteMessage(chatId, messageId);
            console.log(` Deleted Telegram message in chat ${chatId} (Message ID: ${messageId})`);
        }

        // Remove mapping after deletion
        usersMessageMappingTelegram[firebaseUid].delete(whatsappMessageId);
    } catch (error) {
        console.error(` Error deleting Telegram message:`, error);
    }
}

async function deleteForwardedWhatsappMessage(whatsappMessageId, firebaseUid) {
    const messageList = usersMessageMappingWhatsapp[firebaseUid].get(whatsappMessageId);

    if (!messageList || messageList.length === 0) {
        console.log(`No matching Telegram messages found for WhatsApp Message ID: ${whatsappMessageId}`);
        return;
    }

    try {
        for (const message of messageList) {
            //  Random delay (1-2 seconds) before processing
            const randomDelay = Math.floor(Math.random() * 1000) + 1000; // 1000 - 2000 ms
            await sleep(randomDelay);
            await message.delete(true);
        }

        //Remove mapping after deletion
        usersMessageMappingWhatsapp[firebaseUid].delete(whatsappMessageId);
    } catch (error) {
        console.error(`❌ Error deleting Telegram message:`, error);
    }
}









// Start Server
const PORT = 3000;
app.listen(PORT, () => console.log(` Server running on port ${PORT}`));
