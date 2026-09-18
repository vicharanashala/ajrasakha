import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  useGetAllListings,
  useGetMyListings,
  useCreateListing,
  useDeleteListing,
} from "@/hooks/api/listing/useListing";
import {
  useGetMyDeals,
  useCreateDeal,
  useUpdateDealStatus,
} from "@/hooks/api/deal/useDeal";
import { useGetMessages, useSendMessage } from "@/hooks/api/message/useMessage";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import type { IListingResponse } from "@/hooks/services/listingService";

export const Route = createFileRoute("/marketplace/")({
  component: MarketplacePage,
});

function MarketplacePage() {
  const [tab, setTab] = useState<"browse" | "sell" | "deals">("browse");

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-green-700 mb-4">
        🌾 Farmer-to-Buyer Marketplace
      </h1>

      <div className="flex gap-2 mb-6">
        <button
          className={`px-4 py-2 rounded-lg font-medium ${
            tab === "browse" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700"
          }`}
          onClick={() => setTab("browse")}
        >
          Browse Listings
        </button>
        <button
          className={`px-4 py-2 rounded-lg font-medium ${
            tab === "sell" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700"
          }`}
          onClick={() => setTab("sell")}
        >
          Sell Produce
        </button>
        <button
          className={`px-4 py-2 rounded-lg font-medium ${
            tab === "deals" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700"
          }`}
          onClick={() => setTab("deals")}
        >
          My Deals
        </button>
      </div>

      {tab === "browse" && <BrowseListings />}
      {tab === "sell" && <SellProduce />}
      {tab === "deals" && <MyDeals />}
    </div>
  );
}

// ─── BROWSE LISTINGS (buyer view, with search/filter) ───────────────────────

function BrowseListings() {
  const [crop, setCrop] = useState("");
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Debounce so we don't re-fetch on every keystroke.
  const [debouncedFilters, setDebouncedFilters] = useState({
    crop: "",
    state: "",
    district: "",
    minPrice: "",
    maxPrice: "",
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilters({ crop, state, district, minPrice, maxPrice });
    }, 400);
    return () => clearTimeout(timer);
  }, [crop, state, district, minPrice, maxPrice]);

  const { data, isLoading, error } = useGetAllListings({
    crop: debouncedFilters.crop || undefined,
    state: debouncedFilters.state || undefined,
    district: debouncedFilters.district || undefined,
    minPrice: debouncedFilters.minPrice ? Number(debouncedFilters.minPrice) : undefined,
    maxPrice: debouncedFilters.maxPrice ? Number(debouncedFilters.maxPrice) : undefined,
  });

  const { mutate: createDeal, isPending } = useCreateDeal();
  const [offerListingId, setOfferListingId] = useState<string | null>(null);
  const [offerPrice, setOfferPrice] = useState("");
  const [offerQty, setOfferQty] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const listings: IListingResponse[] = data?.listings ?? [];
  const hasActiveFilters = crop || state || district || minPrice || maxPrice;

  const clearFilters = () => {
    setCrop("");
    setState("");
    setDistrict("");
    setMinPrice("");
    setMaxPrice("");
  };

  const handleSendOffer = (listingId: string) => {
    createDeal(
      {
        listingId,
        offeredPrice: Number(offerPrice),
        quantity: Number(offerQty),
      },
      {
        onSuccess: (res) => {
          if (res?.success) {
            setSuccessMsg(res.message || "Offer sent!");
            setOfferListingId(null);
            setOfferPrice("");
            setOfferQty("");
          }
        },
      }
    );
  };

  return (
    <div>
      {/* Search bar */}
      <div className="flex gap-2 mb-3">
        <input
          className="flex-1 border rounded-lg p-2"
          placeholder="Search by crop (e.g. Wheat)"
          value={crop}
          onChange={(e) => setCrop(e.target.value)}
        />
        <button
          className={`px-3 py-2 rounded-lg text-sm font-medium ${
            showFilters ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700"
          }`}
          onClick={() => setShowFilters((prev) => !prev)}
        >
          Filters {hasActiveFilters ? "•" : ""}
        </button>
      </div>

      {/* Expandable filter panel */}
      {showFilters && (
        <div className="border border-gray-200 rounded-lg p-3 mb-4 space-y-2 bg-gray-50">
          <div className="flex gap-2">
            <input
              className="w-1/2 border rounded p-2 text-sm"
              placeholder="State"
              value={state}
              onChange={(e) => setState(e.target.value)}
            />
            <input
              className="w-1/2 border rounded p-2 text-sm"
              placeholder="District"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <input
              className="w-1/2 border rounded p-2 text-sm"
              placeholder="Min price"
              type="number"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
            />
            <input
              className="w-1/2 border rounded p-2 text-sm"
              placeholder="Max price"
              type="number"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            />
          </div>
          {hasActiveFilters && (
            <button
              className="text-sm text-green-700 font-medium"
              onClick={clearFilters}
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {successMsg && (
        <p className="text-green-700 bg-green-50 p-2 rounded text-sm mb-3">{successMsg}</p>
      )}

      {isLoading && <p className="text-gray-500">Loading listings...</p>}
      {error && <p className="text-red-500">Failed to load listings.</p>}

      {!isLoading && !error && listings.length === 0 && (
        <p className="text-gray-500">
          {hasActiveFilters
            ? "No listings match your search. Try adjusting the filters."
            : "No listings available yet."}
        </p>
      )}

      <div className="grid gap-3">
        {listings.map((listing) => (
          <div key={listing._id} className="border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-semibold capitalize">{listing.crop}</h3>
              <span className="text-green-700 font-bold">
                ₹{listing.pricePerUnit}/{listing.unit}
              </span>
            </div>
            <p className="text-sm text-gray-600">
              {listing.quantity} {listing.unit} available
            </p>
            <p className="text-sm text-gray-600">
              📍 {listing.location.district}, {listing.location.state}
            </p>
            {listing.description && (
              <p className="text-sm text-gray-500 mt-1">{listing.description}</p>
            )}

            {offerListingId === listing._id ? (
              <div className="mt-3 border-t pt-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    className="w-1/2 border rounded p-2 text-sm"
                    placeholder="Your price/unit"
                    type="number"
                    value={offerPrice}
                    onChange={(e) => setOfferPrice(e.target.value)}
                  />
                  <input
                    className="w-1/2 border rounded p-2 text-sm"
                    placeholder="Quantity"
                    type="number"
                    value={offerQty}
                    onChange={(e) => setOfferQty(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={isPending}
                    className="bg-green-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
                    onClick={() => listing._id && handleSendOffer(listing._id)}
                  >
                    {isPending ? "Sending..." : "Send Offer"}
                  </button>
                  <button
                    className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded text-sm"
                    onClick={() => setOfferListingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="mt-3 bg-green-600 text-white px-3 py-1.5 rounded text-sm"
                onClick={() => {
                  setOfferListingId(listing._id ?? null);
                  setOfferPrice(listing.pricePerUnit.toString());
                  setOfferQty(listing.quantity.toString());
                  setSuccessMsg("");
                }}
              >
                Make Offer
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SELL PRODUCE (farmer view — create + own listings) ────────────────────

function SellProduce() {
  const { data: myListings } = useGetMyListings();
  const { mutate: createListing, isPending } = useCreateListing();
  const { mutate: deleteListing } = useDeleteListing();

  const [crop, setCrop] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<"kg" | "quintal" | "ton">("quintal");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [description, setDescription] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg("");

    createListing(
      {
        crop,
        quantity: Number(quantity),
        unit,
        pricePerUnit: Number(pricePerUnit),
        location: { state, district },
        description: description || undefined,
      },
      {
        onSuccess: (res) => {
          if (res?.success) {
            setSuccessMsg(res.message || "Listing created!");
            setCrop("");
            setQuantity("");
            setPricePerUnit("");
            setState("");
            setDistrict("");
            setDescription("");
          }
        },
      }
    );
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="border border-gray-200 rounded-lg p-4 mb-6 space-y-3">
        <h2 className="font-semibold text-lg">List Your Produce</h2>

        {successMsg && (
          <p className="text-green-700 bg-green-50 p-2 rounded text-sm">{successMsg}</p>
        )}

        <input
          className="w-full border rounded p-2"
          placeholder="Crop name (e.g. Wheat)"
          value={crop}
          onChange={(e) => setCrop(e.target.value)}
          required
        />

        <div className="flex gap-2">
          <input
            className="w-1/2 border rounded p-2"
            placeholder="Quantity"
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
          <select
            className="w-1/2 border rounded p-2"
            value={unit}
            onChange={(e) => setUnit(e.target.value as "kg" | "quintal" | "ton")}
          >
            <option value="kg">kg</option>
            <option value="quintal">quintal</option>
            <option value="ton">ton</option>
          </select>
        </div>

        <input
          className="w-full border rounded p-2"
          placeholder="Price per unit (₹)"
          type="number"
          value={pricePerUnit}
          onChange={(e) => setPricePerUnit(e.target.value)}
          required
        />

        <div className="flex gap-2">
          <input
            className="w-1/2 border rounded p-2"
            placeholder="State"
            value={state}
            onChange={(e) => setState(e.target.value)}
            required
          />
          <input
            className="w-1/2 border rounded p-2"
            placeholder="District"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            required
          />
        </div>

        <textarea
          className="w-full border rounded p-2"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <button
          type="submit"
          disabled={isPending}
          className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
        >
          {isPending ? "Posting..." : "Post Listing"}
        </button>
      </form>

      <h2 className="font-semibold text-lg mb-2">My Listings</h2>
      <div className="grid gap-3">
        {(myListings?.data ?? []).map((listing: IListingResponse) => (
          <div
            key={listing._id}
            className="border border-gray-200 rounded-lg p-4 shadow-sm flex justify-between items-center"
          >
            <div>
              <h3 className="font-semibold capitalize">{listing.crop}</h3>
              <p className="text-sm text-gray-600">
                {listing.quantity} {listing.unit} @ ₹{listing.pricePerUnit}/{listing.unit}
              </p>
            </div>
            <button
              className="text-red-600 text-sm font-medium"
              onClick={() => listing._id && deleteListing(listing._id)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MY DEALS (both farmer's incoming offers + buyer's sent offers) ────────

const statusColors: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700",
  accepted: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
  completed: "bg-blue-50 text-blue-700",
  cancelled: "bg-gray-100 text-gray-600",
};

function MyDeals() {
  const { data: currentUser } = useGetCurrentUser({ enabled: true });
  const { data, isLoading, error } = useGetMyDeals();
  const { mutate: updateStatus } = useUpdateDealStatus();

  if (isLoading) return <p className="text-gray-500">Loading deals...</p>;
  if (error) return <p className="text-red-500">Failed to load deals.</p>;

  const deals = data?.data ?? [];
  const myId = currentUser?._id;

  if (deals.length === 0) {
    return <p className="text-gray-500">No deals yet. Make an offer on a listing to get started!</p>;
  }

  return (
    <div className="grid gap-3">
      {deals.map((deal: any) => {
        const isFarmer = deal.farmerId === myId;

        return (
          <div key={deal._id} className="border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium">
                {isFarmer ? "Incoming offer" : "Your offer"}
              </span>
              <span
                className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${statusColors[deal.status]}`}
              >
                {deal.status}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {deal.quantity} units @ ₹{deal.offeredPrice}/unit
            </p>

            <DealActionsAndChat deal={deal} isFarmer={isFarmer} myId={myId} updateStatus={updateStatus} />
          </div>
        );
      })}
    </div>
  );
}

// ─── DEAL ACTIONS + CHAT TOGGLE (tracks unread count) ───────────────────────

function DealActionsAndChat({
  deal,
  isFarmer,
  myId,
  updateStatus,
}: {
  deal: any;
  isFarmer: boolean;
  myId?: string;
  updateStatus: (args: { dealId: string; status: any }) => void;
}) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const { data } = useGetMessages(deal._id, true);
  const messages = data?.data ?? [];

  const seenKey = `deal-chat-seen:${deal._id}`;
  const [seenCount, setSeenCount] = useState<number>(() => {
    const stored = localStorage.getItem(seenKey);
    return stored ? Number(stored) : 0;
  });

  const unreadCount = Math.max(0, messages.length - seenCount);

  useEffect(() => {
    if (isChatOpen && messages.length > seenCount) {
      localStorage.setItem(seenKey, String(messages.length));
      setSeenCount(messages.length);
    }
  }, [isChatOpen, messages.length, seenCount, seenKey]);

  return (
    <>
      <div className="flex gap-2 mt-3 flex-wrap items-center">
        {isFarmer && deal.status === "pending" && (
          <>
            <button
              className="bg-green-600 text-white px-3 py-1.5 rounded text-sm"
              onClick={() => deal._id && updateStatus({ dealId: deal._id, status: "accepted" })}
            >
              Accept
            </button>
            <button
              className="bg-red-500 text-white px-3 py-1.5 rounded text-sm"
              onClick={() => deal._id && updateStatus({ dealId: deal._id, status: "rejected" })}
            >
              Reject
            </button>
          </>
        )}

        {deal.status === "accepted" && (
          <button
            className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm"
            onClick={() => deal._id && updateStatus({ dealId: deal._id, status: "completed" })}
          >
            Mark Completed
          </button>
        )}

        {deal.status !== "rejected" && deal.status !== "cancelled" && (
          <button
            className="relative bg-gray-100 text-gray-700 px-3 py-1.5 rounded text-sm"
            onClick={() => setIsChatOpen((prev) => !prev)}
          >
            💬 {isChatOpen ? "Close Chat" : "Chat"}
            {!isChatOpen && unreadCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        )}
      </div>

      {isChatOpen && deal._id && (
        <DealChat dealId={deal._id} myId={myId} messages={messages} />
      )}
    </>
  );
}

// ─── DEAL CHAT (polling-based chat between farmer & buyer) ──────────────────

function DealChat({
  dealId,
  myId,
  messages,
}: {
  dealId: string;
  myId?: string;
  messages: any[];
}) {
  const { mutate: sendMessage, isPending } = useSendMessage(dealId);
  const [text, setText] = useState("");

  const handleSend = () => {
    if (!text.trim()) return;
    sendMessage(text, {
      onSuccess: () => setText(""),
    });
  };

  return (
    <div className="mt-3 border-t pt-3">
      <div className="max-h-48 overflow-y-auto space-y-2 mb-2">
        {messages.length === 0 && (
          <p className="text-xs text-gray-400">No messages yet. Say hello!</p>
        )}
        {messages.map((msg: any) => {
          const isMine = msg.senderId === myId;
          return (
            <div key={msg._id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <span
                className={`text-sm px-3 py-1.5 rounded-lg max-w-[75%] ${
                  isMine ? "bg-green-600 text-white" : "bg-gray-100 text-gray-800"
                }`}
              >
                {msg.text}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded p-2 text-sm"
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <button
          disabled={isPending}
          className="bg-green-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
          onClick={handleSend}
        >
          Send
        </button>
      </div>
    </div>
  );
}
