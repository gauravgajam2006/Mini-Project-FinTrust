import React from 'react';
import { createPortal } from 'react-dom';
import './WarningModal.css';

const WarningModal = ({ 
    isOpen, 
    onConfirm, 
    onCancel, 
    title = 'Confirm Action', 
    message = 'This action is irreversible.',
    confirmText = 'I Understand',
    cancelText = 'Cancel',
    isSubmitting = false
}) => {
    if (!isOpen) return null;

    return createPortal(
        <div className="modal-overlay fade-in" onClick={onCancel}>
            <div className="modal-content scale-in premium-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-warning-icon">
                    ⚠️
                </div>
                <h3>{title}</h3>
                <p className="modal-warning-text">
                    {message}
                    <br/><br/>
                    <strong style={{ color: '#EF4444' }}>This action is permanent and cannot be undone.</strong>
                </p>
                <div className="modal-actions">
                    <button 
                        onClick={onCancel} 
                        className="btn-secondary modal-btn cancel-btn"
                        disabled={isSubmitting}
                    >
                        {cancelText}
                    </button>
                    <button 
                        onClick={onConfirm} 
                        className="btn-danger modal-btn confirm-btn"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? 'Processing...' : confirmText}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default WarningModal;
