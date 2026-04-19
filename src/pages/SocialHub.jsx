import { useState, useEffect } from 'react';
import { useLoan } from '../context/LoanContext';
import { supabase } from '../supabase';
import './SocialHub.css';
import toast from 'react-hot-toast';

const SocialHub = () => {
    const { user, gamification } = useLoan();
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [friends, setFriends] = useState([]);
    const [pendingRequests, setPendingRequests] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showManualForm, setShowManualForm] = useState(false);
    const [manualName, setManualName] = useState('');
    const [manualPhone, setManualPhone] = useState('');

    useEffect(() => {
        if (user) {
            fetchConnections();
        }
    }, [user]);

    const fetchConnections = async () => {
        try {
            const { data, error } = await supabase
                .from('connections')
                .select('*')
                .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

            if (error) throw error;

            const accepted = [];
            const pending = [];

            data.forEach(conn => {
                if (conn.status === 'accepted') {
                    const friendInfo = conn.sender_id === user.id
                        ? { id: conn.receiver_id, name: conn.receiver_name, email: conn.receiver_email }
                        : { id: conn.sender_id, name: conn.sender_name, email: conn.sender_email };
                    accepted.push({ ...conn, friend: friendInfo });
                } else if (conn.status === 'pending' && conn.receiver_id === user.id) {
                    pending.push(conn);
                }
            });

            setFriends(accepted);
            setPendingRequests(pending);
        } catch (error) {
            console.error('Error fetching connections:', error);
        }
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchTerm.trim()) return;

        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .or(`email.eq.${searchTerm.trim()},phone.eq.${searchTerm.trim()}`)
                .neq('id', user.id);

            if (error) throw error;

            setSearchResults(data);
            if (data.length === 0) {
                toast.error('No matching user found. Ensure they have registered with this exact email or phone.');
            }
        } catch (error) {
            console.error('Search error:', error);
            toast.error('Failed to search for users.');
        } finally {
            setLoading(false);
        }
    };

    const sendFriendRequest = async (targetUser) => {
        try {
            const existingFriend = friends.find(f => f.friend.id === targetUser.id);
            if (existingFriend) {
                toast.error(`${targetUser.name} is already your friend!`);
                return;
            }

            const { error } = await supabase
                .from('connections')
                .insert([{
                    sender_id: user.id,
                    sender_name: user.name,
                    sender_email: user.email,
                    receiver_id: targetUser.id,
                    receiver_name: targetUser.name,
                    receiver_email: targetUser.email,
                    status: 'pending'
                }]);

            if (error) throw error;

            toast.success(`Friend request sent to ${targetUser.name}!`);
            setSearchResults([]);
        } catch (error) {
            console.error('Error sending request:', error);
            toast.error('Failed to send request.');
        }
    };

    const handleRequest = async (requestId, accept) => {
        try {
            const { error } = await supabase
                .from('connections')
                .update({ 
                  status: accept ? 'accepted' : 'rejected',
                  updated_at: new Date().toISOString()
                })
                .eq('id', requestId);

            if (error) throw error;

            toast.success(accept ? 'Friend request accepted!' : 'Friend request declined.');
            fetchConnections();
        } catch (error) {
            console.error('Error handling request:', error);
            toast.error('Something went wrong.');
        }
    };

    const sendVouch = async (friendId) => {
        if (gamification.trustScore < 60) {
            toast.error('Your Trust Score must be at least 60 to vouch for someone.');
            return;
        }

        try {
            const { error } = await supabase
                .from('vouches')
                .insert([{
                    from_user: user.id,
                    to_user: friendId
                }]);

            if (error) throw error;
            toast.success('You successfully vouched for this user! Their trustworthiness just grew.', { icon: '🤝' });
        } catch (error) {
            console.error('Error vouching:', error);
            toast.error('Failed to send vouch.');
        }
    };

    const importFromContacts = async () => {
        try {
            if ('contacts' in navigator && 'ContactsManager' in window) {
                const props = ['name', 'tel'];
                const opts = { multiple: true };
                const contacts = await navigator.contacts.select(props, opts);

                if (contacts.length > 0) {
                    const contact = contacts[0];
                    toast.success(`Imported ${contact.name[0]}! (Demo mode)`);
                    const newConn = { friend: { name: contact.name[0], email: contact.tel[0] || 'Unknown Number' }, id: 'imported_' + Date.now(), status: 'accepted' };
                    setFriends(prev => [...prev, newConn]);
                }
            } else {
                toast.error('Contact Picker API not supported on this browser (usually Android Chrome only). Mocking import instead.', { duration: 4000 });
                setTimeout(() => {
                    const newConn = { friend: { name: 'Family Contact (Imported)', email: '+919876543210' }, id: 'mock_' + Date.now(), status: 'accepted' };
                    setFriends(prev => [...prev, newConn]);
                    toast.success('Successfully imported mock contact.');
                }, 1000);
            }
        } catch (err) {
            console.error(err);
            toast.error('Failed to access contacts.');
        }
    };

    const handleManualAdd = (e) => {
        e.preventDefault();
        if (!manualName || !manualPhone) return;

        const newConn = {
            friend: { name: manualName, email: manualPhone },
            id: 'manual_' + Date.now(),
            status: 'accepted'
        };
        setFriends(prev => [...prev, newConn]);
        toast.success(`Successfully added ${manualName} to your network.`);
        setManualName('');
        setManualPhone('');
        setShowManualForm(false);
    };

    return (
        <div className="social-hub fade-in">
            <div className="social-header">
                <h1>👥 Social Hub</h1>
                <p>Connect with trusted friends and family to manage informal loans</p>
            </div>

            <div className="social-grid-wrapper" style={{ position: 'relative' }}>
                <div className="development-overlay">
                    <div className="development-badge">
                        <span>🚧</span>
                        UNDER DEVELOPMENT
                        <span>🚧</span>
                    </div>
                    <p style={{ marginTop: '20px', color: 'var(--color-text-dark)', fontWeight: '600' }}>
                        This feature is coming soon to your trusted network.
                    </p>
                </div>

                <div className="social-grid disabled">
                    <div className="social-left">
                        <div className="social-card">
                            <h3>🔍 Find Contacts</h3>
                            <p className="subtext">Search by exact Email or Phone Number</p>

                            <form onSubmit={handleSearch} className="search-form">
                                <input
                                    type="text"
                                    placeholder="Enter email or +91 phone..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="search-input"
                                />
                                <button type="submit" className="btn-primary" disabled={loading}>
                                    {loading ? 'Searching...' : 'Search'}
                                </button>
                            </form>

                            <div className="contacts-import-section" style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--color-border)' }}>
                                <h4 style={{ marginBottom: '12px', fontSize: '14px', color: 'var(--color-text-medium)' }}>Other ways to connect</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <button onClick={importFromContacts} className="btn-secondary" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                                        📱 Import from Phone Contacts
                                    </button>
                                    <button onClick={() => setShowManualForm(!showManualForm)} className="btn-outline" style={{ width: '100%' }}>
                                        ✍️ Add Contact Manually
                                    </button>
                                </div>

                                {showManualForm && (
                                    <form onSubmit={handleManualAdd} className="manual-add-form" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--color-surface-hover)', padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                                        <input type="text" placeholder="Contact Name" value={manualName} onChange={e => setManualName(e.target.value)} required className="form-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                                        <input type="text" placeholder="Phone Number or Email" value={manualPhone} onChange={e => setManualPhone(e.target.value)} required className="form-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                                        <button type="submit" className="btn-primary" style={{ width: '100%' }}>Add to Network</button>
                                    </form>
                                )}
                            </div>

                            {searchResults.length > 0 && (
                                <div className="search-results">
                                    <h4>Search Results</h4>
                                    {searchResults.map(result => (
                                        <div key={result.id} className="user-list-item">
                                            <div className="user-info">
                                                <div className="user-avatar">
                                                    {result.avatar_url ? (
                                                        <img src={result.avatar_url} alt={result.name} className="avatar-img" />
                                                    ) : (
                                                        result.name?.charAt(0) || 'U'
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="user-name">{result.name}</div>
                                                    <div className="user-email">{result.email}</div>
                                                </div>
                                            </div>
                                            <button
                                                className="btn-secondary btn-small"
                                                onClick={() => sendFriendRequest(result)}
                                            >
                                                Add Friend
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {pendingRequests.length > 0 && (
                            <div className="social-card highlight-card">
                                <h3>👋 Pending Requests</h3>
                                <div className="requests-list">
                                    {pendingRequests.map(req => (
                                        <div key={req.id} className="user-list-item">
                                            <div className="user-info">
                                                <div className="user-avatar">{req.sender_name?.charAt(0) || 'U'}</div>
                                                <div>
                                                    <div className="user-name">{req.sender_name}</div>
                                                    <div className="user-subtext">Wants to connect</div>
                                                </div>
                                            </div>
                                            <div className="request-actions">
                                                <button onClick={() => handleRequest(req.id, true)} className="btn-accept">✓</button>
                                                <button onClick={() => handleRequest(req.id, false)} className="btn-decline">✕</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="social-right">
                        <div className="social-card">
                            <h3>🤝 My Trusted Network ({friends.length})</h3>
                            <p className="subtext">People you can transact with</p>

                            {friends.length === 0 ? (
                                <div className="empty-state">
                                    <span className="empty-icon">📭</span>
                                    <p>Your network is empty.</p>
                                    <p className="empty-subtext">Search for friends and family to start adding them to your trusted circle.</p>
                                </div>
                            ) : (
                                <div className="friends-list">
                                    {friends.map(conn => (
                                        <div key={conn.id} className="friend-card">
                                            <div className="friend-header">
                                                <div className="user-info">
                                                    <div className="user-avatar">{conn.friend.name?.charAt(0) || 'U'}</div>
                                                    <div>
                                                        <div className="user-name">{conn.friend.name}</div>
                                                        <div className="user-email">{conn.friend.email}</div>
                                                    </div>
                                                </div>
                                                <div className="trust-badge">Verified Contact</div>
                                            </div>
                                            <div className="friend-actions">
                                                <button className="btn-secondary btn-small">Create Loan</button>
                                                <button
                                                    className="btn-outline btn-small"
                                                    onClick={() => sendVouch(conn.friend.id)}
                                                    title="Endorse this person's trustworthiness"
                                                >
                                                    Vouch for them
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SocialHub;
