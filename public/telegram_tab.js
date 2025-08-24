document.addEventListener("DOMContentLoaded", async () => {
    const backendUrl = "https://whats2managers.org";
    const userId = JSON.parse(localStorage.getItem("userId")).uid;
    const botNameElement = document.getElementById("bot-name");
    const telegramChatsList = document.getElementById("telegram-chats-list");
    const selectedChatsList = document.getElementById("selected-chats-list");

    // ✅ Fetch user's bot information
    async function fetchUserBot() {
        try {
            const response = await fetch(`${backendUrl}/get-user-bot/${userId}`);
            const data = await response.json();
            botNameElement.textContent = data.botName || "No Bot Assigned";
        } catch (error) {
            console.error("❌ Error fetching bot info:", error);
        }
    }

    // ✅ Fetch available Telegram chats
    async function fetchTelegramChats() {
        try {
            const response = await fetch(`${backendUrl}/get-telegram-chats/${userId}`);
            const data = await response.json();
            telegramChatsList.innerHTML = "";

            if (!data.success || data.chats.length === 0) {
                telegramChatsList.innerHTML = "<li>No available chats found.</li>";
                return;
            }

            data.chats.forEach(chat => {
                const li = document.createElement("li");
                li.innerHTML = `
                    <label>
                        <input type="checkbox" value="${chat.chatId}" class="chat-checkbox"> ${chat.chatName}
                    </label>
                `;
                telegramChatsList.appendChild(li);
            });

        } catch (error) {
            console.error("❌ Error fetching Telegram chats:", error);
        }
    }

    // ✅ Save selected Telegram chats
    // document.getElementById("save-chats").addEventListener("click", async () => {
    //     const selectedChats = [...document.querySelectorAll(".chat-checkbox:checked")].map(el => el.value);

    //     try {
    //         const response = await fetch(`${backendUrl}/save-telegram-chats/${userId}`, {
    //             method: "POST",
    //             headers: { "Content-Type": "application/json" },
    //             body: JSON.stringify({ selectedChats })
    //         });

    //         const data = await response.json();
    //         alert(data.message);
    //     } catch (error) {
    //         console.error("❌ Error saving Telegram chats:", error);
    //     }
    // });

    fetchUserBot();
    fetchTelegramChats();
});
