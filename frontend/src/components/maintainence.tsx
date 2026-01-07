import React from 'react';

const ReviewMaintenance: React.FC = () => {
    return (
        <div className="min-h-screen bg-green-50 dark:bg-green-950 flex flex-col items-center justify-center p-6 font-sans transition-all duration-500 overflow-hidden">

            {/* Background Decorative Element: Animated Grid */}
            <div className="absolute inset-0 opacity-10 dark:opacity-5 pointer-events-none">
                <div className="h-full w-full" style={{
                    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 39px, currentColor 39px, currentColor 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, currentColor 39px, currentColor 40px)',
                    color: 'rgb(134 239 172 / 0.3)'
                }}></div>
            </div>

            {/* Floating Particles */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-20 left-20 w-2 h-2 bg-green-400 rounded-full opacity-40 animate-bounce" style={{animationDuration: '3s', animationDelay: '0s'}}></div>
                <div className="absolute top-40 right-32 w-1.5 h-1.5 bg-green-500 rounded-full opacity-30 animate-bounce" style={{animationDuration: '4s', animationDelay: '1s'}}></div>
                <div className="absolute bottom-32 left-40 w-2.5 h-2.5 bg-green-300 rounded-full opacity-20 animate-bounce" style={{animationDuration: '5s', animationDelay: '2s'}}></div>
                <div className="absolute top-60 right-20 w-1 h-1 bg-green-600 rounded-full opacity-50 animate-bounce" style={{animationDuration: '3.5s', animationDelay: '0.5s'}}></div>
            </div>

            {/* Main Animation: Logo */}
            <div className="relative mb-16">
                {/* Glow Effect */}
                <div className="absolute inset-0 bg-primary-500 opacity-20 blur-3xl rounded-full scale-150 animate-pulse"></div>
                
                {/* Logo Container */}
                <div className="w-32 h-32 bg-white dark:bg-primary-900 rounded-3xl flex items-center justify-center relative z-10 shadow-2xl shadow-primary-500/50 border-4 border-primary-200 dark:border-primary-800 transform hover:scale-105 transition-transform duration-300 p-4">
                    <img 
                        src="logo.png" 
                        alt="Annam Logo" 
                        className="w-full h-full object-contain"
                    />
                </div>

                {/* Enhanced Animated Seeds */}
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex space-x-4">
                    <div className="w-4 h-4 bg-primary-400 rounded-full animate-bounce shadow-lg shadow-primary-400/50" style={{animationDelay: '-0.3s', animationDuration: '1.5s'}}></div>
                    <div className="w-4 h-4 bg-primary-600 rounded-full animate-bounce shadow-lg shadow-primary-600/50" style={{animationDelay: '-0.15s', animationDuration: '1.5s'}}></div>
                    <div className="w-4 h-4 bg-primary-300 rounded-full animate-bounce shadow-lg shadow-primary-300/50" style={{animationDuration: '1.5s'}}></div>
                </div>

                {/* Enhanced Ground Shadow */}
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-32 h-4 bg-primary-900/20 dark:bg-primary-100/10 rounded-full blur-xl"></div>
            </div>

            {/* Enhanced Text Content */}
            <div className="max-w-2xl text-center z-10 px-4">
                <h1 className="text-5xl md:text-6xl font-black tracking-tight text-green-800 dark:text-green-100 mb-4 uppercase leading-tight">
                    Server Under <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-green-500 dark:from-green-400 dark:to-green-300">Maintenance</span>
                </h1>

                <div className="flex justify-center items-center space-x-6 mb-10">
                    <div className="h-0.5 w-16 bg-gradient-to-r from-transparent to-green-400"></div>
                    <span className="text-xs font-bold uppercase tracking-widest text-green-600 dark:text-green-400">
                        Field System Maintenance
                    </span>
                    <div className="h-0.5 w-16 bg-gradient-to-l from-transparent to-green-400"></div>
                </div>

                <p className="text-xl text-green-700 dark:text-green-300 mb-16 leading-relaxed font-medium">
                    Our systems are currently offline as we <span className="text-green-800 dark:text-green-200 font-bold">optimize our services</span>.
                    We are working to ensure the best experience for you.
                </p>

                {/* Enhanced Status Dashboard */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-lg mx-auto">
                    <div className="bg-green-50 dark:bg-green-800 border-2 border-green-300 dark:border-green-700 p-6 rounded-2xl shadow-xl shadow-green-500/10 hover:shadow-2xl hover:shadow-green-500/20 transition-all duration-300 hover:-translate-y-1">
                        <p className="text-xs uppercase font-black text-green-600 dark:text-green-300 mb-2 tracking-widest">Operation</p>
                        <p className="text-lg font-bold text-green-800 dark:text-green-100">Fixing Reputation Score</p>
                    </div>

                    <div className="bg-gradient-to-br from-green-500 to-green-600 border-2 border-green-400 p-6 rounded-2xl shadow-xl shadow-green-500/30 hover:shadow-2xl hover:shadow-green-500/40 transition-all duration-300 hover:-translate-y-1">
                        <p className="text-xs uppercase font-black text-green-100 mb-2 tracking-widest">Expected Uptime</p>
                        <p className="text-lg font-bold text-white">12:15 PM IST</p>
                    </div>
                </div>
            </div>

            {/* Enhanced Footer */}
            <footer className="mt-24 flex flex-col items-center opacity-70 hover:opacity-100 transition-opacity duration-300">
                <div className="flex items-center space-x-3 text-xs font-bold text-green-700 dark:text-green-300 uppercase tracking-widest mb-2">
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-600"></span>
                    </span>
                    <span>System Status: Maintenance</span>
                </div>
                <p className="text-xs text-green-600 dark:text-green-400 font-semibold">
                    &copy; {new Date().getFullYear()} Annam AI. All rights reserved.
                </p>
            </footer>
        </div>
    );
};

export default ReviewMaintenance;