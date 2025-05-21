import Image from 'next/image'
import Link from 'next/link'

export default function HoodiesPage() {
  return (
    <div className="container py-12">
      <h1 className="text-3xl font-bold mb-8">Hoodies</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* Example Hoodie Product */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <Link href="/products/1">
            <Image
              src="/assets/images/coming-soon.png"
              alt="Hoodie"
              width={400}
              height={400}
              className="w-full h-64 object-cover"
            />
          </Link>
          <div className="p-4">
            <Link href="/products/1" className="block">
              <h3 className="text-xl font-semibold mb-2 hover:text-gray-600">Hoodie Name</h3>
            </Link>
            <p className="text-gray-600 mb-4">$49.99</p>
            <button className="btn-primary w-full">Add to Cart</button>
          </div>
        </div>
        
        {/* Add more hoodie products here */}
      </div>
    </div>
  )
} 