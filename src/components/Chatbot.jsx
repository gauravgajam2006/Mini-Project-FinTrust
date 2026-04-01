import { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";
import './Chatbot.css';

// Initialize Gemini from environment variable
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

// Only initialize if we have a key
const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

const SYSTEM_INSTRUCTION = `
You are FinBot, the intelligent assistant for Fintrust, a simplified peer-to-peer loan management application.
Your goal is to help users manage their loans, understand the app, and answer basic financial questions.

About Fintrust:
- It helps track money lent to friends/family and money borrowed from them.
- It is NOT a bank and does NOT provide actual loans. It is a tracking tool.
- Key features: Dashboard (overview), Create Loan (log a new transaction), Loan Details (track payments), Reminders (3 days before due).
- Tech stack: React, Vite, Modern CSS.

Tone:
- Friendly, professional, and helpful.
- Concise and to the point.
- Use emojis occasionally to be engaging.

If asked about features:
- "Dashboard": Shows summaries of lent/borrowed amounts and recent activity.
- "Create Loan": Form to log a new loan with person name, amount, date, etc.
- "Reminders": Automatic alerts for loans due within 3 days.

If asked about yourself:
- You are an AI assistant powered by Google Gemini.
`;

const Chatbot = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { id: 1, text: "Hi! I'm FinBot 🤖. How can I help you with your finance tracking today?", sender: 'ai' }
    ]);
    const [inputValue, setInputValue] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isOpen]);

    const handleSend = async () => {
        if (!inputValue.trim()) return;

        const userMessage = {
            id: Date.now(),
            text: inputValue,
            sender: 'user'
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue("");
        setIsLoading(true);

        try {
            if (!genAI) {
                throw new Error('AI assistant is not configured. Please set VITE_GEMINI_API_KEY.');
            }

            // Using "gemini-flash-latest" alias to target the current efficient free-tier capable model
            const model = genAI.getGenerativeModel({
                model: "gemini-flash-latest"
            });

            // Combine system instruction with user input for context
            const fullPrompt = `${SYSTEM_INSTRUCTION}\n\nUser: ${inputValue}`;

            const result = await model.generateContent(fullPrompt);
            const response = result.response;
            const text = response.text();

            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                text: text,
                sender: 'ai'
            }]);

        } catch (error) {
            console.error("Chatbot Error:", error);

            let errorMessage = "Sorry, I'm having trouble connecting right now. 😓";

            if (error.message?.includes("API key") || error.status === 403) {
                errorMessage = "It looks like my AI credentials aren't set up correctly. Please check the API Key.";
            } else if (error.status === 429 || error.message?.includes("429")) {
                errorMessage = "I'm receiving too many requests right now (Rate Limit). Please wait a moment and try again! ⏳";
            } else if (error.message) {
                errorMessage = `Error: ${error.message}`;
            }

            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                text: errorMessage,
                sender: 'ai'
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="chatbot-container">
            {isOpen && (
                <div className="chat-window">
                    <div className="chat-header">
                        <div className="chat-title">
                            <span>🤖</span> FinBot
                        </div>
                        <button className="chat-close" onClick={() => setIsOpen(false)}>×</button>
                    </div>

                    <div className="chat-messages">
                        {messages.map(msg => (
                            <div key={msg.id} className={`message ${msg.sender}`}>
                                {msg.text}
                            </div>
                        ))}
                        {isLoading && (
                            <div className="typing-indicator">
                                <div className="typing-dot"></div>
                                <div className="typing-dot"></div>
                                <div className="typing-dot"></div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="chat-input-area">
                        <input
                            type="text"
                            className="chat-input"
                            placeholder="Ask about Fintrust..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyPress}
                            disabled={isLoading}
                        />
                        <button
                            className="chat-send"
                            onClick={handleSend}
                            disabled={isLoading || !inputValue.trim()}
                        >
                            ➤
                        </button>
                    </div>
                </div>
            )}

            <button className="chatbot-toggle" onClick={() => setIsOpen(!isOpen)}>
                <span className="chatbot-icon">{isOpen ? '✕' : '💬'}</span>
            </button>
        </div>
    );
};

export default Chatbot;
