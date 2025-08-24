document.addEventListener("DOMContentLoaded", async () => {
    const backendUrl = "https://whats2managers.org"; // ✅ Change if hosted online
    const userId = JSON.parse(localStorage.getItem("userId"))?.uid || null;

    if (!userId) {
        console.error("❌ No user ID found. Redirecting to login...");
        window.location.href = "/auth.html";
    }

    const mainChatDropdown = document.getElementById("main-chat");
    const targetChatsContainer = document.getElementById("target-chats");
    const saveButton = document.getElementById("save-selection");
    const statusMessage = document.getElementById("status-message");

    console.log("User ID:", userId);

    // ✅ Fetch available chats
    async function fetchChats(force = false) {
        const cachedChats = loadChatsFromStorage();

        if (!force && cachedChats) {
            populateChats(cachedChats);
            return;
        }
        try {
            document.getElementById('loadingOverlay').style.display = 'block';
            const response = await fetch(`${backendUrl}/chats/${userId}`);
            const data = await response.json();

            if (!data.success) {
                window.location.href = "/";
                throw new Error("Failed to fetch chats");
            }
            localStorage.setItem("whatsappChats", JSON.stringify(data.chats));
            populateChats(data.chats);

        } catch (error) {
            console.error("❌ Error loading chats:", error);
            statusMessage.textContent = "Error fetching chats.";
        } finally{
            document.getElementById('loadingOverlay').style.display = 'none';

        }
    }

    // ✅ Save chat selection
    saveButton.addEventListener("click", async () => {
        const mainChat = mainChatDropdown.value;
        const targetChats = [...document.querySelectorAll("#target-chats input:checked")].map(cb => cb.value);

        if (!mainChat || targetChats.length === 0) {
            statusMessage.textContent = "Please select a main chat and at least one target chat.";
            return;
        }

        try {
            const response = await fetch(`${backendUrl}/save-chats/${userId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mainChat, targetChats })
            });

            const result = await response.json();
            statusMessage.textContent = result.message;
        } catch (error) {
            console.error("❌ Error saving chats:", error);
            statusMessage.textContent = "Failed to save selections.";
        }
    });
    function loadChatsFromStorage() {
        const savedChats = localStorage.getItem("whatsappChats");
        if (savedChats) {
            return JSON.parse(savedChats);
        }
        return null;
    }
    function populateChats(chats) {
        mainChatDropdown.innerHTML = "";
        targetChatsContainer.innerHTML = "";
    
        chats.forEach(chat => {
            const option = document.createElement("option");
            option.value = chat.id;
            option.textContent = chat.name;
            mainChatDropdown.appendChild(option);
        });
    
        chats.forEach(chat => {
            const chatItem = document.createElement("div");
            chatItem.classList.add("chat-item");
    
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = chat.id;
            checkbox.id = `chat-${chat.id}`;
    
            const label = document.createElement("label");
            label.textContent = chat.name;
            label.setAttribute("for", `chat-${chat.id}`);
    
            chatItem.appendChild(checkbox);
            chatItem.appendChild(label);
            targetChatsContainer.appendChild(chatItem);
        });
    }
    document.getElementById("refresh-chats").addEventListener("click", () => {
        fetchChats(true);
    });
    
    

    fetchChats();
});
