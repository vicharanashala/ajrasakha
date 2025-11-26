// "use client"
// import { useState, useMemo } from "react"
// import { ChevronLeft, ChevronRight, ChevronDown, Calendar, CheckCircle, XCircle, Edit } from "lucide-react"
// import { Button } from '@/components/atoms/button'

// type ActivityStatus = "APPROVED" | "REJECTED" | "MODIFIED"
// type ActivityType = "Answer" | "Question"

// interface ActivityItem {
//     id: number
//     timestamp: string
//     status: ActivityStatus
//     type: ActivityType
//     description: string
//     hasContext: boolean
// }

// // Dummy data for activity history
// const generateDummyData = (): ActivityItem[] => {
//     const statuses: ActivityStatus[] = ["APPROVED", "REJECTED", "MODIFIED"]
//     const types: ActivityType[] = ["Answer", "Question"]
//     const activities = [
//         'Answered to "What is the capital of France??????????? >>>>>>" with content "The capital of France is Paris."',
//         'Rejected question submission: "Why is the sky greener??" (Reason: Spam/low quality).',
//         'Modified previous answer regarding "Python List Comprehension". Changed code example for clarity.',
//         'Approved question: "How do async functions work in JavaScript?"',
//         'Answered to "What is React?" with a detailed explanation about React library.',
//         'Rejected submission: "What is 2+2?" (Reason: Duplicate question).',
//         'Modified answer about "TypeScript Types" with better examples.',
//         'Approved question: "How to implement state management?"',
//         'Answered "What is Node.js?" with comprehensive content.',
//         'Rejected: "How do I hack?" (Reason: Malicious intent).',
//         'Modified answer on "CSS Flexbox" for better clarity.',
//         'Approved question: "What is REST API?"',
//         'Answered "How to use Git?" with step-by-step guide.',
//         'Rejected: "Spam question" (Reason: Low quality).',
//         'Modified answer on "JavaScript Closures".',
//         'Approved question: "What is Docker?"',
//         'Answered "Explain machine learning" comprehensively.',
//         'Rejected: "Another spam" (Reason: Duplicate).',
//         'Modified answer on "Web Security".',
//         'Approved question: "What is Kubernetes?"',
//     ]

//     const specific: ActivityItem[] = [
//         {
//             id: 154,
//             timestamp: new Date(2023, 9, 26, 10, 15).toLocaleString("en-US", {
//                 month: "short",
//                 day: "numeric",
//                 hour: "2-digit",
//                 minute: "2-digit",
//                 hour12: true,
//             }),
//             status: "APPROVED",
//             type: "Answer",
//             description: 'Answered to "What is the capital of France?" with content "The capital of France is Paris."',
//             hasContext: true,
//         },
//         {
//             id: 153,
//             timestamp: new Date(2023, 9, 25, 16, 30).toLocaleString("en-US", {
//                 month: "short",
//                 day: "numeric",
//                 hour: "2-digit",
//                 minute: "2-digit",
//                 hour12: true,
//             }),
//             status: "REJECTED",
//             type: "Question",
//             description: 'Rejected question submission: "Why is the sky greener??" (Reason: Spam/low quality).',
//             hasContext: true,
//         },
//         {
//             id: 152,
//             timestamp: new Date(2023, 9, 24, 11, 0).toLocaleString("en-US", {
//                 month: "short",
//                 day: "numeric",
//                 hour: "2-digit",
//                 minute: "2-digit",
//                 hour12: true,
//             }),
//             status: "MODIFIED",
//             type: "Answer",
//             description: 'Modified previous answer regarding "Python List Comprehension". Changed code example for clarity.',
//             hasContext: true,
//         },
//         {
//             id: 151,
//             timestamp: new Date(2023, 9, 24, 9, 45).toLocaleString("en-US", {
//                 month: "short",
//                 day: "numeric",
//                 hour: "2-digit",
//                 minute: "2-digit",
//                 hour12: true,
//             }),
//             status: "APPROVED",
//             type: "Question",
//             description: 'Approved question: "How do async functions work in JavaScript?"',
//             hasContext: true,
//         },
//     ]

//     const startTime = new Date(2023, 9, 1).getTime()
//     const endTime = new Date(2023, 9, 27).getTime()
//     const others: ActivityItem[] = Array.from({ length: 150 }, (_, i) => {
//         const randomTime = startTime + Math.random() * (endTime - startTime)
//         return {
//             id: i + 1,
//             timestamp: new Date(randomTime).toLocaleString("en-US", {
//                 month: "short",
//                 day: "numeric",
//                 hour: "2-digit",
//                 minute: "2-digit",
//                 hour12: true,
//             }),
//             status: statuses[Math.floor(Math.random() * statuses.length)],
//             type: types[Math.floor(Math.random() * types.length)],
//             description: activities[Math.floor(Math.random() * activities.length)],
//             hasContext: true,
//         }
//     })

//     const allItems = [...specific, ...others]
//     const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
//     const parseTimestampToDate = (ts: string): Date => {
//         const parts = ts.split(", ")
//         const datePart = parts[0].split(" ")
//         const month = monthNames.indexOf(datePart[0]) + 1
//         const day = parseInt(datePart[1])
//         const timePart = parts[1].split(" ")
//         let [hours, minutes] = timePart[0].split(":").map(Number)
//         const ampm = timePart[1]
//         if (ampm === "PM" && hours !== 12) hours += 12
//         if (ampm === "AM" && hours === 12) hours = 0
//         return new Date(2023, month - 1, day, hours, minutes)
//     }

//     return allItems.sort((a, b) => parseTimestampToDate(b.timestamp).getTime() - parseTimestampToDate(a.timestamp).getTime())
// }

// const getStatusColor = (status: ActivityStatus) => {
//     switch (status) {
//         case "APPROVED":
//             return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900 dark:text-green-100 dark:border-green-800"
//         case "REJECTED":
//             return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900 dark:text-red-100 dark:border-red-800"
//         case "MODIFIED":
//             return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900 dark:text-amber-100 dark:border-amber-800"
//     }
// }

// const getStatusIcon = (status: ActivityStatus) => {
//     switch (status) {
//         case "APPROVED":
//             return <CheckCircle className="w-4 h-4" />
//         case "REJECTED":
//             return <XCircle className="w-4 h-4" />
//         case "MODIFIED":
//             return <Edit className="w-4 h-4" />
//     }
// }

// const getTypeIcon = (type: ActivityType) => {
//     return type === "Answer" ? (
//         <div className="w-8 h-8 rounded bg-purple-500 flex items-center justify-center text-white text-sm font-bold">A</div>
//     ) : (
//         <div className="w-8 h-8 rounded bg-blue-500 flex items-center justify-center text-white text-sm font-bold">?</div>
//     )
// }

// const getFormattedTimestamp = (timestamp: string) => {
//     const today = new Date(2023, 9, 26)
//     const yesterday = new Date(today.getTime() - 86400000)
//     const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
//     const parts = timestamp.split(", ")
//     const datePart = parts[0].split(" ")
//     const month = monthNames.indexOf(datePart[0]) + 1
//     const day = parseInt(datePart[1])
//     const time = parts[1]
//     const itemDate = new Date(2023, month - 1, day)
//     let prefix = ""
//     if (itemDate.toDateString() === today.toDateString()) {
//         prefix = "Today, "
//     } else if (itemDate.toDateString() === yesterday.toDateString()) {
//         prefix = "Yesterday, "
//     } else {
//         return timestamp
//     }
//     return prefix + time
// }

// export default function UserActivityHistory() {
//     const [dateRange, setDateRange] = useState({
//         start: new Date(2023, 9, 1),
//         end: new Date(2023, 9, 26),
//     })
//     const [showDatePicker, setShowDatePicker] = useState(false)
//     const [currentPage, setCurrentPage] = useState(1)
//     const itemsPerPage = 20

//     const allData = useMemo(() => generateDummyData(), [])
//     const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
//     const parseTimestampToDate = useMemo(() => (ts: string): Date => {
//         const parts = ts.split(", ")
//         const datePart = parts[0].split(" ")
//         const month = monthNames.indexOf(datePart[0]) + 1
//         const day = parseInt(datePart[1])
//         const timePart = parts[1].split(" ")
//         let [hours, minutes] = timePart[0].split(":").map(Number)
//         const ampm = timePart[1]
//         if (ampm === "PM" && hours !== 12) hours += 12
//         if (ampm === "AM" && hours === 12) hours = 0
//         return new Date(2023, month - 1, day, hours, minutes)
//     }, [monthNames])

//     const filteredData = useMemo(() => {
//         const startTime = dateRange.start.getTime()
//         const endTime = dateRange.end.getTime() + 86400000 - 1
//         return allData.filter(item => {
//             const itemTime = parseTimestampToDate(item.timestamp).getTime()
//             return itemTime >= startTime && itemTime <= endTime
//         })
//     }, [dateRange, allData, parseTimestampToDate])

//     const totalPages = Math.ceil(filteredData.length / itemsPerPage)
//     const startIndex = (currentPage - 1) * itemsPerPage
//     const endIndex = startIndex + itemsPerPage
//     const currentItems = filteredData.slice(startIndex, endIndex)

//     const handleDateChangeStart = (e: React.ChangeEvent<HTMLInputElement>) => {
//         setDateRange({ ...dateRange, start: new Date(e.target.value) })
//     }

//     const handleDateChangeEnd = (e: React.ChangeEvent<HTMLInputElement>) => {
//         setDateRange({ ...dateRange, end: new Date(e.target.value) })
//     }

//     const formatDateRange = () => {
//         return `Date: ${dateRange.start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${dateRange.end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
//     }

    

//     return (
//         <main className="min-h-screen bg-gray-50 dark:bg-black p-4 sm:p-8">
//             <div className="max-w-6xl mx-auto">
//                 {/* Header */}
//                 <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">User Activity History</h1>

//                 {/* Date Filter */}
//                 <div className="mb-6 relative">
//                     <Button
//                         variant="outline"
//                         className="inline-flex items-center gap-2 px-3 py-2 bg-white dark:bg-black border border-gray-200 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
//                         onClick={() => setShowDatePicker(!showDatePicker)}
//                     >
//                         <Calendar className="w-4 h-4" />
//                         <span>{formatDateRange()}</span>
//                         <ChevronDown className="w-4 h-4" />
//                     </Button>

//                     {/* Date Picker Dropdown */}
//                     {showDatePicker && (
//                         <div className="absolute top-full mt-2 bg-white dark:bg-black border border-gray-600 dark:border-white rounded-lg p-4 shadow-lg z-10 min-w-80">
//                             <div className="space-y-4">
//                                 <div>
//                                     <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">Start Date</label>
//                                     <input
//                                         type="date"
//                                         value={dateRange.start.toISOString().split("T")[0]}
//                                         onChange={handleDateChangeStart}
//                                         className="w-full px-3 py-2 border border-gray-300 dark:border-white rounded-lg text-gray-700 dark:text-white bg-white dark:bg-black"
//                                     />
//                                 </div>
//                                 <div>
//                                     <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">End Date</label>
//                                     <input
//                                         type="date"
//                                         value={dateRange.end.toISOString().split("T")[0]}
//                                         onChange={handleDateChangeEnd}
//                                         className="w-full px-3 py-2 border border-gray-300 dark:border-white rounded-lg text-gray-700 dark:text-white bg-white dark:bg-black"
//                                     />
//                                 </div>
//                                 <Button
//                                     className="w-full bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-black"
//                                     onClick={() => setShowDatePicker(false)}
//                                 >
//                                     Apply Filter
//                                 </Button>
//                             </div>
//                         </div>
//                     )}
//                 </div>

//                 {/* Activity Items */}
//                 <div className="space-y-6">
//                     {currentItems.map((item) => (
//                         <div
//                             key={item.id}
//                             className="bg-white dark:bg-black border border-gray-100 dark:border-gray-600 rounded-lg p-6 hover:shadow-md dark:hover:shadow-gray-800 transition-shadow overflow-hidden"
//                         >
//                             <div className="grid grid-cols-[140px_min-content_110px_min-content_32px_min-content_1fr_min-content_120px] items-center gap-3">
//                                 {/* Timestamp */}
//                                 <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
//                                     {getFormattedTimestamp(item.timestamp)}
//                                 </div>

//                                 {/* Separator after timestamp */}
//                                 <span className="text-gray-300 dark:text-gray-700 text-xs">|</span>

//                                 {/* Status Badge */}
//                                 <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold justify-center ${getStatusColor(item.status)}`}>
//                                     {getStatusIcon(item.status)}
//                                     {item.status}
//                                 </div>

//                                 {/* Separator */}
//                                 <span className="text-gray-300 dark:text-gray-700 text-xs">|</span>

//                                 {/* Type Icon */}
//                                 <div className="flex justify-center">{getTypeIcon(item.type)}</div>

//                                 {/* Separator */}
//                                 <span className="text-gray-300 dark:text-gray-700 text-xs">|</span>

//                                 {/* Description */} 
//                                 <div className="min-w-0">
//                                     <p
//                                         className="text-gray-700 dark:text-gray-300 text-sm truncate"
//                                         title={item.description}
//                                     >
//                                         {item.description}
//                                     </p>
//                                 </div>

//                                 {/* Separator */}
//                                 <span className="text-gray-300 dark:text-gray-500 text-xs">|</span>

//                                 {/* View Context Link */}
//                                 <div className="flex items-center gap-1 text-sm text-primary dark:text-green-600 hover:text-primary dark:hover:text-green-500 cursor-pointer justify-end">
//                                     <span>View Context</span>
//                                     <ChevronRight className="w-4 h-4" />
//                                 </div>
//                             </div>
//                         </div>
//                     ))}
//                 </div>

//                 {/* Pagination */}
//                 <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
//                     <p className="text-sm text-gray-600 dark:text-gray-300">
//                         Showing {startIndex + 1}-{Math.min(endIndex, filteredData.length)} of {filteredData.length} items
//                     </p>

//                     <div className="flex items-center gap-2 flex-wrap justify-center">
//                         <Button
//                             variant="outline"
//                             size="sm"
//                             onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
//                             disabled={currentPage === 1}
//                             className="gap-1 text-gray-700 dark:text-white border-gray-200 dark:border-white hover:bg-gray-50 dark:hover:bg-gray-800"
//                         >
//                             <ChevronLeft className="w-4 h-4" />
//                             Prev
//                         </Button>

//                         {/* Page Numbers */}
//                         {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
//                             let pageNum
//                             if (totalPages <= 3) {
//                                 pageNum = i + 1
//                             } else if (currentPage <= 2) {
//                                 pageNum = i + 1
//                             } else if (currentPage >= totalPages - 1) {
//                                 pageNum = totalPages - 2 + i
//                             } else {
//                                 pageNum = currentPage - 1 + i
//                             }
//                             return pageNum
//                         }).map((pageNum) => (
//                             <button
//                                 key={pageNum}
//                                 onClick={() => setCurrentPage(pageNum)}
//                                 className={`px-3 py-1 rounded text-sm font-medium transition-colors border border-gray-200 dark:border-white ${currentPage === pageNum
//                                         ? "bg-gray-900 dark:bg-white text-white dark:text-black"
//                                         : "text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
//                                     }`}
//                             >
//                                 {pageNum}
//                             </button>
//                         ))}

//                         {totalPages > 3 && currentPage < totalPages - 1 && <span className="px-2 text-gray-600 dark:text-gray-300">...</span>}

//                         <Button
//                             variant="outline"
//                             size="sm"
//                             onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
//                             disabled={currentPage === totalPages}
//                             className="gap-1 text-gray-700 dark:text-white border-gray-200 dark:border-white hover:bg-gray-50 dark:hover:bg-gray-800"
//                         >
//                             Next
//                             <ChevronRight className="w-4 h-4" />
//                         </Button>
//                     </div>
//                 </div>
//             </div>
//         </main>
//     )
// }







"use client"
import { useState, useMemo } from "react"
import { ChevronLeft, ChevronRight, ChevronDown, Calendar, CheckCircle, XCircle, Edit, X } from "lucide-react"
import { Button } from '@/components/atoms/button'

type ActivityStatus = "APPROVED" | "REJECTED" | "MODIFIED"
type ActivityType = "Answer" | "Question"

interface ActivityItem {
    id: number
    timestamp: string
    status: ActivityStatus
    type: ActivityType
    description: string
    hasContext: boolean
}

interface ModalData {
    question: string
    currentAnswer: string
    modifiedAnswer?: string
    remark?: string
    reviewParameters?: {
        contextRelevance: boolean
        technicalAccuracy: boolean
        credibilityUtility: boolean
        valueInsight: boolean
        readabilityCommunication: boolean
    }
}

// Dummy data for activity history
const generateDummyData = (): ActivityItem[] => {
    const statuses: ActivityStatus[] = ["APPROVED", "REJECTED", "MODIFIED"]
    const types: ActivityType[] = ["Answer", "Question"]
    const activities = [
        'Answered to "What is the capital of France??????????? >>>>>>" with content "The capital of France is Paris."',
        'Rejected question submission: "Why is the sky greener??" (Reason: Spam/low quality).',
        'Modified previous answer regarding "Python List Comprehension". Changed code example for clarity.',
        'Approved question: "How do async functions work in JavaScript?"',
        'Answered to "What is React?" with a detailed explanation about React library.',
        'Rejected submission: "What is 2+2?" (Reason: Duplicate question).',
        'Modified answer about "TypeScript Types" with better examples.',
        'Approved question: "How to implement state management?"',
        'Answered "What is Node.js?" with comprehensive content.',
        'Rejected: "How do I hack?" (Reason: Malicious intent).',
        'Modified answer on "CSS Flexbox" for better clarity.',
        'Approved question: "What is REST API?"',
        'Answered "How to use Git?" with step-by-step guide.',
        'Rejected: "Spam question" (Reason: Low quality).',
        'Modified answer on "JavaScript Closures".',
        'Approved question: "What is Docker?"',
        'Answered "Explain machine learning" comprehensively.',
        'Rejected: "Another spam" (Reason: Duplicate).',
        'Modified answer on "Web Security".',
        'Approved question: "What is Kubernetes?"',
    ]

    const specific: ActivityItem[] = [
        {
            id: 154,
            timestamp: new Date(2023, 9, 26, 10, 15).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
            }),
            status: "APPROVED",
            type: "Answer",
            description: 'Answered to "What is the capital of France?" with content "The capital of France is Paris."',
            hasContext: true,
        },
        {
            id: 153,
            timestamp: new Date(2023, 9, 25, 16, 30).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
            }),
            status: "REJECTED",
            type: "Question",
            description: 'Rejected question submission: "Why is the sky greener??" (Reason: Spam/low quality).',
            hasContext: true,
        },
        {
            id: 152,
            timestamp: new Date(2023, 9, 24, 11, 0).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
            }),
            status: "MODIFIED",
            type: "Answer",
            description: 'Modified previous answer regarding "Python List Comprehension". Changed code example for clarity.',
            hasContext: true,
        },
        {
            id: 151,
            timestamp: new Date(2023, 9, 24, 9, 45).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
            }),
            status: "APPROVED",
            type: "Question",
            description: 'Approved question: "How do async functions work in JavaScript?"',
            hasContext: true,
        },
    ]

    const startTime = new Date(2023, 9, 1).getTime()
    const endTime = new Date(2023, 9, 27).getTime()
    const others: ActivityItem[] = Array.from({ length: 150 }, (_, i) => {
        const randomTime = startTime + Math.random() * (endTime - startTime)
        return {
            id: i + 1,
            timestamp: new Date(randomTime).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
            }),
            status: statuses[Math.floor(Math.random() * statuses.length)],
            type: types[Math.floor(Math.random() * types.length)],
            description: activities[Math.floor(Math.random() * activities.length)],
            hasContext: true,
        }
    })

    const allItems = [...specific, ...others]
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const parseTimestampToDate = (ts: string): Date => {
        const parts = ts.split(", ")
        const datePart = parts[0].split(" ")
        const month = monthNames.indexOf(datePart[0]) + 1
        const day = parseInt(datePart[1])
        const timePart = parts[1].split(" ")
        let [hours, minutes] = timePart[0].split(":").map(Number)
        const ampm = timePart[1]
        if (ampm === "PM" && hours !== 12) hours += 12
        if (ampm === "AM" && hours === 12) hours = 0
        return new Date(2023, month - 1, day, hours, minutes)
    }

    return allItems.sort((a, b) => parseTimestampToDate(b.timestamp).getTime() - parseTimestampToDate(a.timestamp).getTime())
}

// Function to generate modal data based on item
const getModalData = (item: ActivityItem): ModalData => {
    const defaultParams = {
        contextRelevance: true,
        technicalAccuracy: false,
        credibilityUtility: false,
        valueInsight: false,
        readabilityCommunication: true
    }

    // Extract question from description for demo
    const extractQuestion = (desc: string): string => {
        const match = desc.match(/"([^"]+)"/)
        return match ? match[1] : 'Sample Question'
    }

    switch (item.status) {
        case 'APPROVED':
            return {
                question: extractQuestion(item.description),
                currentAnswer: item.type === 'Answer' 
                    ? 'This is the approved answer based on official documentation.' 
                    : 'Question approved for publication.'
            }
        case 'REJECTED':
            return {
                question: extractQuestion(item.description),
                currentAnswer: item.type === 'Answer' 
                    ? 'Original submitted answer.' 
                    : 'Submitted question.',
                modifiedAnswer: 'Rejected version with errors.',
                remark: item.description.includes('Reason:') 
                    ? item.description.split('(Reason:')[1].replace(').', '').trim() 
                    : 'Rejected due to low quality or spam.',
                reviewParameters: defaultParams
            }
        case 'MODIFIED':
            return {
                question: extractQuestion(item.description),
                currentAnswer: 'Original answer.',
                modifiedAnswer: 'Modified version with improvements for clarity and accuracy.',
                remark: 'Modification: Updated examples and fixed minor issues.',
                reviewParameters: defaultParams
            }
        default:
            return {
                question: 'Default Question',
                currentAnswer: 'Default Answer'
            }
    }
}

const getStatusColor = (status: ActivityStatus) => {
    switch (status) {
        case "APPROVED":
            return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900 dark:text-green-100 dark:border-green-800"
        case "REJECTED":
            return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900 dark:text-red-100 dark:border-red-800"
        case "MODIFIED":
            return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900 dark:text-amber-100 dark:border-amber-800"
    }
}

const getStatusIcon = (status: ActivityStatus) => {
    switch (status) {
        case "APPROVED":
            return <CheckCircle className="w-4 h-4" />
        case "REJECTED":
            return <XCircle className="w-4 h-4" />
        case "MODIFIED":
            return <Edit className="w-4 h-4" />
    }
}

const getTypeIcon = (type: ActivityType) => {
    return type === "Answer" ? (
        <div className="w-8 h-8 rounded bg-purple-500 flex items-center justify-center text-white text-sm font-bold">A</div>
    ) : (
        <div className="w-8 h-8 rounded bg-blue-500 flex items-center justify-center text-white text-sm font-bold">?</div>
    )
}

const getFormattedTimestamp = (timestamp: string) => {
    const today = new Date(2023, 9, 26)
    const yesterday = new Date(today.getTime() - 86400000)
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const parts = timestamp.split(", ")
    const datePart = parts[0].split(" ")
    const month = monthNames.indexOf(datePart[0]) + 1
    const day = parseInt(datePart[1])
    const time = parts[1]
    const itemDate = new Date(2023, month - 1, day)
    let prefix = ""
    if (itemDate.toDateString() === today.toDateString()) {
        prefix = "Today, "
    } else if (itemDate.toDateString() === yesterday.toDateString()) {
        prefix = "Yesterday, "
    } else {
        return timestamp
    }
    return prefix + time
}

// Modal Component
const ViewContextModal = ({ item, onClose }: { item: ActivityItem; onClose: () => void }) => {
    const data = getModalData(item)
    const contentType = item.type.toLowerCase()
    const actionType = item.status.toLowerCase()
    const headerText = `New ${actionType} ${contentType}`

    const getReviewParameterIcon = (value: boolean) => value ? '✅' : '❌'

    const renderApprovedView = () => (
        <>
            <h3 className="text-lg font-semibold mb-4">View Context: {headerText.charAt(0).toUpperCase() + headerText.slice(1)}</h3>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-white mb-1">Question:</label>
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded border">{data.question}</div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-white mb-1">Current {contentType}:</label>
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded border">{data.currentAnswer}</div>
                </div>
            </div>
        </>
    )

    const renderRejectedOrModifiedView = () => (
        <>
            <h3 className="text-lg font-semibold mb-4">View Context: {headerText.charAt(0).toUpperCase() + headerText.slice(1)}</h3>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-white mb-1">Question:</label>
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded border">{data.question}</div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-white mb-1">Current {contentType}:</label>
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded border">{data.currentAnswer}</div>
                </div>
                {data.modifiedAnswer && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-white mb-1">
                            {item.status === 'REJECTED' ? 'Rejected' : 'Modified'} {contentType}:
                        </label>
                        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded border">{data.modifiedAnswer}</div>
                    </div>
                )}
                {data.reviewParameters && (
                    <div>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-white mb-2">Review Parameters</h4>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>Context Relevance {getReviewParameterIcon(data.reviewParameters.contextRelevance)}</div>
                            <div>Technical Accuracy {getReviewParameterIcon(data.reviewParameters.technicalAccuracy)}</div>
                            <div>Credibility & Utility {getReviewParameterIcon(data.reviewParameters.credibilityUtility)}</div>
                            <div>Value Insight {getReviewParameterIcon(data.reviewParameters.valueInsight)}</div>
                            <div className="col-span-2">Readability & Communication {getReviewParameterIcon(data.reviewParameters.readabilityCommunication)}</div>
                        </div>
                    </div>
                )}
                {data.remark && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-white mb-1">Remark:</label>
                        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded border">{data.remark}</div>
                    </div>
                )}
            </div>
        </>
    )

    const renderView = () => {
        if (item.status === 'APPROVED') {
            return renderApprovedView()
        } else {
            return renderRejectedOrModifiedView()
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-black rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
                {renderView()}
                <div className="mt-6 flex justify-end">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="flex items-center gap-2"
                    >
                        <X className="w-4 h-4" />
                        Close
                    </Button>
                </div>
            </div>
        </div>
    )
}

export default function UserActivityHistory() {
    const [dateRange, setDateRange] = useState({
        start: new Date(2023, 9, 1),
        end: new Date(2023, 9, 26),
    })
    const [showDatePicker, setShowDatePicker] = useState(false)
    const [currentPage, setCurrentPage] = useState(1)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedItem, setSelectedItem] = useState<ActivityItem | null>(null)
    const itemsPerPage = 20

    const allData = useMemo(() => generateDummyData(), [])
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const parseTimestampToDate = useMemo(() => (ts: string): Date => {
        const parts = ts.split(", ")
        const datePart = parts[0].split(" ")
        const month = monthNames.indexOf(datePart[0]) + 1
        const day = parseInt(datePart[1])
        const timePart = parts[1].split(" ")
        let [hours, minutes] = timePart[0].split(":").map(Number)
        const ampm = timePart[1]
        if (ampm === "PM" && hours !== 12) hours += 12
        if (ampm === "AM" && hours === 12) hours = 0
        return new Date(2023, month - 1, day, hours, minutes)
    }, [monthNames])

    const filteredData = useMemo(() => {
        const startTime = dateRange.start.getTime()
        const endTime = dateRange.end.getTime() + 86400000 - 1
        return allData.filter(item => {
            const itemTime = parseTimestampToDate(item.timestamp).getTime()
            return itemTime >= startTime && itemTime <= endTime
        })
    }, [dateRange, allData, parseTimestampToDate])

    const totalPages = Math.ceil(filteredData.length / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    const currentItems = filteredData.slice(startIndex, endIndex)

    const handleDateChangeStart = (e: React.ChangeEvent<HTMLInputElement>) => {
        setDateRange({ ...dateRange, start: new Date(e.target.value) })
    }

    const handleDateChangeEnd = (e: React.ChangeEvent<HTMLInputElement>) => {
        setDateRange({ ...dateRange, end: new Date(e.target.value) })
    }

    const formatDateRange = () => {
        return `Date: ${dateRange.start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${dateRange.end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    }

    const handleViewContext = (item: ActivityItem) => {
        setSelectedItem(item)
        setIsModalOpen(true)
    }

    const closeModal = () => {
        setIsModalOpen(false)
        setSelectedItem(null)
    }

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-black p-4 sm:p-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">User Activity History</h1>

                {/* Date Filter */}
                <div className="mb-6 relative">
                    <Button
                        variant="outline"
                        className="inline-flex items-center gap-2 px-3 py-2 bg-white dark:bg-black border border-gray-200 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
                        onClick={() => setShowDatePicker(!showDatePicker)}
                    >
                        <Calendar className="w-4 h-4" />
                        <span>{formatDateRange()}</span>
                        <ChevronDown className="w-4 h-4" />
                    </Button>

                    {/* Date Picker Dropdown */}
                    {showDatePicker && (
                        <div className="absolute top-full mt-2 bg-white dark:bg-black border border-gray-600 dark:border-white rounded-lg p-4 shadow-lg z-10 min-w-80">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">Start Date</label>
                                    <input
                                        type="date"
                                        value={dateRange.start.toISOString().split("T")[0]}
                                        onChange={handleDateChangeStart}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-white rounded-lg text-gray-700 dark:text-white bg-white dark:bg-black"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">End Date</label>
                                    <input
                                        type="date"
                                        value={dateRange.end.toISOString().split("T")[0]}
                                        onChange={handleDateChangeEnd}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-white rounded-lg text-gray-700 dark:text-white bg-white dark:bg-black"
                                    />
                                </div>
                                <Button
                                    className="w-full bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-black"
                                    onClick={() => setShowDatePicker(false)}
                                >
                                    Apply Filter
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Activity Items */}
                <div className="space-y-6">
                    {currentItems.map((item) => (
                        <div
                            key={item.id}
                            className="bg-white dark:bg-black border border-gray-100 dark:border-gray-600 rounded-lg p-6 hover:shadow-md dark:hover:shadow-gray-800 transition-shadow overflow-hidden"
                        >
                            <div className="grid grid-cols-[140px_min-content_110px_min-content_32px_min-content_1fr_min-content_120px] items-center gap-3">
                                {/* Timestamp */}
                                <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                    {getFormattedTimestamp(item.timestamp)}
                                </div>

                                {/* Separator after timestamp */}
                                <span className="text-gray-300 dark:text-gray-700 text-xs">|</span>

                                {/* Status Badge */}
                                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold justify-center ${getStatusColor(item.status)}`}>
                                    {getStatusIcon(item.status)}
                                    {item.status}
                                </div>

                                {/* Separator */}
                                <span className="text-gray-300 dark:text-gray-700 text-xs">|</span>

                                {/* Type Icon */}
                                <div className="flex justify-center">{getTypeIcon(item.type)}</div>

                                {/* Separator */}
                                <span className="text-gray-300 dark:text-gray-700 text-xs">|</span>

                                {/* Description */} 
                                <div className="min-w-0">
                                    <p
                                        className="text-gray-700 dark:text-gray-300 text-sm truncate"
                                        title={item.description}
                                    >
                                        {item.description}
                                    </p>
                                </div>

                                {/* Separator */}
                                <span className="text-gray-300 dark:text-gray-500 text-xs">|</span>

                                {/* View Context Link */}
                                <div 
                                    className="flex items-center gap-1 text-sm text-primary dark:text-green-600 hover:text-primary dark:hover:text-green-500 cursor-pointer justify-end"
                                    onClick={() => handleViewContext(item)}
                                >
                                    <span>View Context</span>
                                    <ChevronRight className="w-4 h-4" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Pagination */}
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        Showing {startIndex + 1}-{Math.min(endIndex, filteredData.length)} of {filteredData.length} items
                    </p>

                    <div className="flex items-center gap-2 flex-wrap justify-center">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                            className="gap-1 text-gray-700 dark:text-white border-gray-200 dark:border-white hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Prev
                        </Button>

                        {/* Page Numbers */}
                        {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                            let pageNum
                            if (totalPages <= 3) {
                                pageNum = i + 1
                            } else if (currentPage <= 2) {
                                pageNum = i + 1
                            } else if (currentPage >= totalPages - 1) {
                                pageNum = totalPages - 2 + i
                            } else {
                                pageNum = currentPage - 1 + i
                            }
                            return pageNum
                        }).map((pageNum) => (
                            <button
                                key={pageNum}
                                onClick={() => setCurrentPage(pageNum)}
                                className={`px-3 py-1 rounded text-sm font-medium transition-colors border border-gray-200 dark:border-white ${currentPage === pageNum
                                        ? "bg-gray-900 dark:bg-white text-white dark:text-black"
                                        : "text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
                                    }`}
                            >
                                {pageNum}
                            </button>
                        ))}

                        {totalPages > 3 && currentPage < totalPages - 1 && <span className="px-2 text-gray-600 dark:text-gray-300">...</span>}

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                            className="gap-1 text-gray-700 dark:text-white border-gray-200 dark:border-white hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                            Next
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && selectedItem && (
                <ViewContextModal item={selectedItem} onClose={closeModal} />
            )}
        </main>
    )
}